import fs from "node:fs";
import path from "node:path";
import { chromium, type Frame, type Locator, type Page } from "playwright";

type MinimalWorkerInput = {
  surveyUrl: string;
  storeCode: string;
  validatorCode: string;
};

type MinimalWorkerResult = {
  ok: boolean;
  finalUrl: string | null;
  title: string | null;
  currentStep: string;
  screenshots: string[];
  error?: string;
  stack?: string | null;
};

type InputCandidate = {
  frame: Frame;
  frameName: string;
  frameUrl: string;
  index: number;
  selector: string;
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  surroundingText: string;
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
  score: number;
};

const STORE_KEYWORDS = ["store", "codigo", "código", "tienda"];
const VALIDATOR_KEYWORDS = ["validator", "valid", "folio"];

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildOutputDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(process.cwd(), "output", "playwright", "minimal-runs", stamp);
}

async function saveScreenshot(page: Page, outputDir: string, fileName: string, screenshots: string[]) {
  const targetPath = path.join(outputDir, fileName);
  await page.screenshot({ path: targetPath, fullPage: true, type: "png" });
  screenshots.push(targetPath);
  return targetPath;
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
          type: "type" in control ? control.type ?? "" : "",
          name: control.getAttribute("name") ?? "",
          id: control.id ?? "",
          placeholder: control.getAttribute("placeholder") ?? "",
          surroundingText,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0",
          disabled: "disabled" in control ? Boolean(control.disabled) : false,
          readOnly: "readOnly" in control ? Boolean(control.readOnly) : false
        };
      }, index)
      .catch(() => null);

    if (!detected) {
      continue;
    }

    candidates.push({
      ...detected,
      frame,
      frameName: frame.name(),
      frameUrl: frame.url(),
      score: 0
    });
  }

  return candidates;
}

async function collectAllInputCandidates(page: Page) {
  const nested = await Promise.all(page.frames().map((frame) => collectInputCandidatesFromFrame(frame)));
  return nested.flat();
}

function scoreStoreInput(candidate: InputCandidate) {
  const haystack = normalizeText(
    `${candidate.name} ${candidate.id} ${candidate.placeholder} ${candidate.surroundingText}`
  );
  let score = 0;

  if (candidate.visible) score += 100;
  if (!candidate.disabled) score += 40;
  if (!candidate.readOnly) score += 40;
  if (["text", "search", "tel", "number", ""].includes(candidate.type.toLowerCase())) score += 20;
  if (STORE_KEYWORDS.some((keyword) => haystack.includes(keyword))) score += 150;
  if (VALIDATOR_KEYWORDS.some((keyword) => haystack.includes(keyword))) score -= 40;
  if (["hidden", "submit", "button", "checkbox", "radio", "file", "image", "password"].includes(candidate.type.toLowerCase())) {
    score -= 200;
  }

  return score;
}

function scoreValidatorInput(candidate: InputCandidate) {
  const haystack = normalizeText(
    `${candidate.name} ${candidate.id} ${candidate.placeholder} ${candidate.surroundingText}`
  );
  let score = 0;

  if (candidate.visible) score += 100;
  if (!candidate.disabled) score += 40;
  if (!candidate.readOnly) score += 40;
  if (["text", "search", "tel", "number", "password", ""].includes(candidate.type.toLowerCase())) score += 20;
  if (VALIDATOR_KEYWORDS.some((keyword) => haystack.includes(keyword))) score += 180;
  if (STORE_KEYWORDS.some((keyword) => haystack.includes(keyword))) score -= 80;
  if (["hidden", "submit", "button", "checkbox", "radio", "file", "image"].includes(candidate.type.toLowerCase())) {
    score -= 200;
  }

  return score;
}

async function findBestStoreInput(page: Page) {
  const candidates = await collectAllInputCandidates(page);
  const filtered = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreStoreInput(candidate)
    }))
    .filter((candidate) => candidate.visible && !candidate.disabled && !candidate.readOnly && candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return filtered[0] ?? null;
}

async function findBestValidatorInput(page: Page) {
  const candidates = await collectAllInputCandidates(page);
  const filtered = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreValidatorInput(candidate)
    }))
    .filter((candidate) => candidate.visible && !candidate.disabled && !candidate.readOnly && candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return filtered[0] ?? null;
}

async function fillInput(locator: Locator, value: string) {
  await locator.click({ timeout: 10_000 });
  await locator.fill(value, { timeout: 10_000 });
}

async function detectValidatorScreen(page: Page, initialUrl: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15_000) {
    await page.waitForLoadState("load").catch(() => undefined);
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    const validatorInput = await findBestValidatorInput(page);

    if (validatorInput) {
      const locator = validatorInput.frame.locator("input, textarea, select").nth(validatorInput.index);

      if (await isLocatorVisible(locator)) {
        return {
          validatorInput,
          currentUrl,
          urlChanged: currentUrl !== initialUrl
        };
      }
    }
  }

  throw new Error("No se detectó la pantalla de validator después de enviar el store code.");
}

export async function runMinimalSurveyFlow(input: MinimalWorkerInput): Promise<MinimalWorkerResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const screenshots: string[] = [];
  const outputDir = buildOutputDir();
  let currentStep = "launch";

  ensureDir(outputDir);

  try {
    currentStep = "opening_survey";
    await page.goto(input.surveyUrl, { waitUntil: "load", timeout: 60_000 });
    await page.waitForLoadState("load");
    await saveScreenshot(page, outputDir, "01-opening-survey.png", screenshots);

    currentStep = "filling_store_code";
    const storeInput = await findBestStoreInput(page);
    if (!storeInput) {
      throw new Error("No se encontró un input visible y editable para storeCode.");
    }

    const storeLocator = storeInput.frame.locator("input, textarea, select").nth(storeInput.index);
    if (!(await isLocatorVisible(storeLocator))) {
      throw new Error(`El input de storeCode dejó de ser visible: ${storeInput.selector}`);
    }

    await fillInput(storeLocator, input.storeCode);
    await saveScreenshot(page, outputDir, "02-store-code-filled.png", screenshots);

    currentStep = "submitting_store_code";
    const initialUrl = page.url();
    await storeLocator.press("Enter");
    await saveScreenshot(page, outputDir, "03-store-code-submitted.png", screenshots);

    currentStep = "detecting_validator_screen";
    const validatorScreen = await detectValidatorScreen(page, initialUrl);
    await saveScreenshot(page, outputDir, "04-validator-screen-detected.png", screenshots);

    currentStep = "filling_validator_code";
    const validatorLocator = validatorScreen.validatorInput.frame
      .locator("input, textarea, select")
      .nth(validatorScreen.validatorInput.index);

    if (!(await isLocatorVisible(validatorLocator))) {
      throw new Error(`El input de validator dejó de ser visible: ${validatorScreen.validatorInput.selector}`);
    }

    await fillInput(validatorLocator, input.validatorCode);
    await saveScreenshot(page, outputDir, "05-validator-code-filled.png", screenshots);

    currentStep = "stopped_after_validator";
    return {
      ok: true,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      currentStep,
      screenshots
    };
  } catch (error) {
    await saveScreenshot(page, outputDir, "99-fatal-error.png", screenshots).catch(() => undefined);

    return {
      ok: false,
      finalUrl: page.url?.() ?? null,
      title: await page.title().catch(() => null),
      currentStep,
      screenshots,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
