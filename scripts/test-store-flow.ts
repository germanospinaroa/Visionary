import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, type ElementHandle, type Frame, type Locator, type Page } from "playwright";

type DetectedInput = {
  frameName: string;
  frameUrl: string;
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
};

type DetectedButton = {
  frameName: string;
  frameUrl: string;
  tag: string;
  text: string;
  type: string;
  name: string;
  id: string;
  value: string;
  visible: boolean;
  disabled: boolean;
};

type DetectedIframe = {
  name: string;
  id: string;
  src: string;
  title: string;
  visible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
};

type InputCandidate = DetectedInput & {
  index: number;
  selector: string;
  surroundingText: string;
  score: number;
  frame: Frame;
};

type ButtonCandidate = DetectedButton & {
  index: number;
  selector: string;
  score: number;
  frame: Frame;
};

function loadLocalEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function isLocatorVisible(locator: Locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function collectInputCandidatesFromFrame(frame: Frame): Promise<InputCandidate[]> {
  const locator = frame.locator("input, textarea, select");
  const total = await locator.count();
  const candidates: InputCandidate[] = [];

  for (let index = 0; index < total; index += 1) {
    const detected = await locator
      .nth(index)
      .evaluate((element, elementIndex) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const type = "type" in control ? control.type ?? "" : "";
        const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
        const surroundingText = (
          label?.textContent ||
          element.closest("form")?.textContent ||
          element.parentElement?.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);

        return {
          index: elementIndex as number,
          selector: `input, textarea, select >> nth=${elementIndex as number}`,
          tag: element.tagName.toLowerCase(),
          type,
          name: control.getAttribute("name") ?? "",
          id: control.id ?? "",
          placeholder: control.getAttribute("placeholder") ?? "",
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0",
          disabled: "disabled" in control ? Boolean(control.disabled) : false,
          readOnly: "readOnly" in control ? Boolean(control.readOnly) : false,
          surroundingText
        };
      }, index)
      .catch(() => null);

    if (!detected) {
      continue;
    }

    const haystack = normalizeText(
      `${detected.name} ${detected.id} ${detected.placeholder} ${detected.surroundingText}`
    );
    let score = 0;

    if (detected.visible) score += 100;
    if (!detected.disabled) score += 40;
    if (!detected.readOnly) score += 40;
    if (["text", "search", "tel", "number", ""].includes(detected.type.toLowerCase())) score += 20;
    if (haystack.includes("store")) score += 80;
    if (haystack.includes("codigo")) score += 70;
    if (haystack.includes("código")) score += 70;
    if (haystack.includes("tienda")) score += 70;
    if (haystack.includes("folio")) score += 40;
    if (haystack.includes("validator")) score -= 20;
    if (["hidden", "submit", "button", "checkbox", "radio", "file", "image"].includes(detected.type.toLowerCase())) {
      score -= 200;
    }

    candidates.push({
      ...detected,
      frameName: frame.name(),
      frameUrl: frame.url(),
      score,
      frame
    });
  }

  return candidates;
}

async function collectButtonCandidatesFromFrame(frame: Frame): Promise<ButtonCandidate[]> {
  const locator = frame.locator('button, input[type="button"], input[type="submit"], [role="button"]');
  const total = await locator.count();
  const candidates: ButtonCandidate[] = [];

  for (let index = 0; index < total; index += 1) {
    const detected = await locator
      .nth(index)
      .evaluate((element, elementIndex) => {
        const htmlElement = element as HTMLElement;
        const inputElement = element as HTMLInputElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = (htmlElement.innerText || htmlElement.textContent || inputElement.value || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);

        return {
          index: elementIndex as number,
          selector: 'button, input[type="button"], input[type="submit"], [role="button"] >> nth=' + (elementIndex as number),
          tag: element.tagName.toLowerCase(),
          text,
          type: inputElement.type ?? "",
          name: element.getAttribute("name") ?? "",
          id: htmlElement.id ?? "",
          value: inputElement.value ?? "",
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0",
          disabled: "disabled" in inputElement ? Boolean(inputElement.disabled) : false
        };
      }, index)
      .catch(() => null);

    if (!detected) {
      continue;
    }

    const haystack = normalizeText(`${detected.text} ${detected.name} ${detected.id} ${detected.value}`);
    let score = 0;

    if (detected.visible) score += 100;
    if (!detected.disabled) score += 40;
    if (haystack.includes("entrar")) score += 200;
    if (haystack.includes("ingresar")) score += 120;
    if (haystack.includes("acceder")) score += 110;
    if (haystack.includes("continuar")) score += 90;
    if (detected.tag === "button") score += 10;

    candidates.push({
      ...detected,
      frameName: frame.name(),
      frameUrl: frame.url(),
      score,
      frame
    });
  }

  return candidates;
}

async function listInputs(page: Page) {
  const items: DetectedInput[] = [];

  for (const frame of page.frames()) {
    const frameCandidates = await collectInputCandidatesFromFrame(frame);
    items.push(
      ...frameCandidates.map(({ frame: _frame, index: _index, selector: _selector, surroundingText: _text, score: _score, ...rest }) => rest)
    );
  }

  return items;
}

async function listButtons(page: Page) {
  const items: DetectedButton[] = [];

  for (const frame of page.frames()) {
    const frameCandidates = await collectButtonCandidatesFromFrame(frame);
    items.push(
      ...frameCandidates.map(({ frame: _frame, index: _index, selector: _selector, score: _score, ...rest }) => rest)
    );
  }

  return items;
}

async function listIframes(page: Page): Promise<DetectedIframe[]> {
  const locator = page.locator("iframe");
  const total = await locator.count();
  const items: DetectedIframe[] = [];

  for (let index = 0; index < total; index += 1) {
    const frameLocator = locator.nth(index);
    const metadata = await frameLocator
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const iframe = element as HTMLIFrameElement;

        return {
          name: iframe.name ?? "",
          id: iframe.id ?? "",
          src: iframe.src ?? "",
          title: iframe.title ?? "",
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0"
        };
      })
      .catch(() => null);

    const boundingBox = await frameLocator.boundingBox().catch(() => null);

    if (metadata) {
      items.push({
        ...metadata,
        boundingBox
      });
    }
  }

  return items;
}

async function findBestInput(page: Page) {
  const allCandidates = (await Promise.all(page.frames().map((frame) => collectInputCandidatesFromFrame(frame)))).flat();
  const filtered = allCandidates.filter((candidate) => candidate.visible && !candidate.disabled && !candidate.readOnly && candidate.score > 0);

  filtered.sort((left, right) => right.score - left.score);
  return filtered[0] ?? null;
}

async function findEntryButton(page: Page) {
  const allCandidates = (await Promise.all(page.frames().map((frame) => collectButtonCandidatesFromFrame(frame)))).flat();
  const filtered = allCandidates.filter((candidate) => candidate.visible && !candidate.disabled && candidate.score > 0);

  filtered.sort((left, right) => right.score - left.score);
  return filtered[0] ?? null;
}

async function focusElementHandle(locator: Locator): Promise<ElementHandle<HTMLElement> | null> {
  const handle = await locator.elementHandle();
  if (!handle) {
    return null;
  }

  return handle as ElementHandle<HTMLElement>;
}

async function main() {
  loadLocalEnvFile(path.join(process.cwd(), ".env.local"));
  loadLocalEnvFile(path.join(process.cwd(), ".env"));

  const surveyUrl = getArgValue("url") ?? process.env.NEXT_PUBLIC_SURVEY_URL;
  if (!surveyUrl) {
    throw new Error("Missing survey URL. Use --url=<real-survey-url> or set NEXT_PUBLIC_SURVEY_URL in .env.local.");
  }

  const outputDir = path.join(process.cwd(), "output", "playwright", "store-flow");
  ensureDir(outputDir);

  const errors: string[] = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const initialPageUrl = surveyUrl;
  const navigationEvents: string[] = [];
  let runError: string | null = null;

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure?.errorText ?? "unknown_error"}`);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigationEvents.push(frame.url());
    }
  });

  try {
    console.log(`Opening survey URL: ${surveyUrl}`);
    await page.goto(surveyUrl, { waitUntil: "load", timeout: 60_000 });
    await page.waitForLoadState("load");

    const initialScreenshotPath = path.join(outputDir, "initial.png");
    await page.screenshot({ path: initialScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${initialScreenshotPath}`);

    const inputs = await listInputs(page);
    const buttons = await listButtons(page);
    const iframes = await listIframes(page);

    console.log("Detected inputs:");
    console.log(formatJson(inputs));
    console.log("Detected buttons:");
    console.log(formatJson(buttons));
    console.log("Detected iframes:");
    console.log(formatJson(iframes));

    const bestInput = await findBestInput(page);
    if (!bestInput) {
      throw new Error("No visible editable input candidate found.");
    }

    const inputLocator = bestInput.frame.locator("input, textarea, select").nth(bestInput.index);
    if (!(await isLocatorVisible(inputLocator))) {
      throw new Error(`Input candidate is no longer visible: ${bestInput.selector}`);
    }

    await inputLocator.click({ timeout: 10_000 });
    await inputLocator.fill("TEST123", { timeout: 10_000 });

    const inputValue = await inputLocator.inputValue().catch(() => null);
    const activeElement = await bestInput.frame.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) {
        return null;
      }

      return {
        tag: element.tagName.toLowerCase(),
        id: element.id ?? "",
        name: element.getAttribute("name") ?? "",
        type: "type" in element ? (element as HTMLInputElement).type ?? "" : "",
        outerHTML: element.outerHTML.slice(0, 300)
      };
    });
    const boundingBox = await inputLocator.boundingBox();

    console.log("Input validation:");
    console.log(
      formatJson({
        selectedCandidate: {
          frameName: bestInput.frameName,
          frameUrl: bestInput.frameUrl,
          selector: bestInput.selector,
          score: bestInput.score,
          name: bestInput.name,
          id: bestInput.id,
          placeholder: bestInput.placeholder,
          type: bestInput.type,
          surroundingText: bestInput.surroundingText
        },
        inputValue,
        activeElement,
        boundingBox
      })
    );

    const filledScreenshotPath = path.join(outputDir, "filled.png");
    await page.screenshot({ path: filledScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${filledScreenshotPath}`);

    const entryButton = await findEntryButton(page);
    if (!entryButton) {
      throw new Error('No "Entrar" button candidate found.');
    }

    const buttonLocator = entryButton.frame
      .locator('button, input[type="button"], input[type="submit"], [role="button"]')
      .nth(entryButton.index);
    const buttonHandle = await focusElementHandle(buttonLocator);
    const buttonDescription = await buttonLocator.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      const inputElement = element as HTMLInputElement;
      return {
        tag: element.tagName.toLowerCase(),
        text: (htmlElement.innerText || htmlElement.textContent || inputElement.value || "").replace(/\s+/g, " ").trim(),
        id: htmlElement.id ?? "",
        name: element.getAttribute("name") ?? ""
      };
    });

    console.log("Clicking entry button:");
    console.log(
      formatJson({
        frameName: entryButton.frameName,
        frameUrl: entryButton.frameUrl,
        selector: entryButton.selector,
        score: entryButton.score,
        button: buttonDescription
      })
    );

    if (!buttonHandle) {
      throw new Error("Could not resolve button element handle.");
    }

    await buttonHandle.click({ timeout: 10_000 });
    await page.waitForTimeout(5_000);

    const afterClickScreenshotPath = path.join(outputDir, "after-click.png");
    await page.screenshot({ path: afterClickScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${afterClickScreenshotPath}`);

  } catch (error) {
    runError = error instanceof Error ? error.stack ?? error.message : String(error);
    errors.push(runError);
    throw error;
  } finally {
    const finalUrl = page.url();
    const finalTitle = await page.title().catch(() => "");

    console.log("Final page state:");
    console.log(
      formatJson({
        finalUrl,
        finalTitle,
        navigationOccurred: finalUrl !== initialPageUrl || navigationEvents.length > 1,
        navigationEvents,
        errors
      })
    );

    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
