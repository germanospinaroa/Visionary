import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, type Frame, type Locator, type Page } from "playwright";

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

type AttemptMode = "fill_click" | "fill_enter" | "keyboard_tab_click" | "fill_events_click" | "form_submit";

type AttemptConfig = {
  name: string;
  mode: AttemptMode;
};

type ElementState = {
  value: string | null;
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  type: string;
  inputMode: string;
  maxLength: number;
  minLength: number;
  pattern: string;
  ariaDisabled: string | null;
  className: string;
  validationMessage: string;
  checkValidity: boolean;
  activeElement: {
    tag: string;
    id: string;
    name: string;
    type: string;
  } | null;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
};

type ButtonState = {
  text: string;
  disabled: boolean;
  ariaDisabled: string | null;
  className: string;
  checkVisibility: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
};

type ListenerSummary = {
  registeredListeners: Array<{
    type: string;
    targetTag: string;
    targetId: string;
    targetName: string;
    targetRole: string;
  }>;
  inputInlineHandlers: Record<string, boolean>;
  buttonInlineHandlers: Record<string, boolean>;
  formInlineHandlers: Record<string, boolean>;
};

type RawListenerSummary = {
  registeredListeners: Array<Record<string, string>>;
  inputInlineHandlers: Record<string, boolean>;
  buttonInlineHandlers: Record<string, boolean>;
  formInlineHandlers: Record<string, boolean>;
};

type AttemptResult = {
  attempt: string;
  mode: AttemptMode;
  finalUrl: string;
  finalTitle: string;
  navigationOccurred: boolean;
  navigationEvents: string[];
  inputStateBefore: ElementState;
  inputStateAfterFill: ElementState;
  inputStateAfterAction: ElementState;
  buttonStateBefore: ButtonState;
  buttonStateAfterFill: ButtonState;
  buttonStateAfterAction: ButtonState;
  listenerSummary: ListenerSummary;
  errors: string[];
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

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
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
  const filtered = allCandidates.filter((candidate) => candidate.visible && candidate.score > 0);

  filtered.sort((left, right) => right.score - left.score);
  return filtered[0] ?? null;
}

async function installListenerProbe(page: Page) {
  await page.addInitScript(() => {
    const globalKey = "__storeFlowListeners";
    const relevantTypes = new Set(["input", "change", "blur", "focus", "keypress", "keydown", "keyup", "click", "submit"]);

    const recorder = (window as typeof window & { [key: string]: unknown }) as {
      __storeFlowListeners?: Array<Record<string, string>>;
    };

    recorder.__storeFlowListeners = [];

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patchedAddEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      if (relevantTypes.has(type)) {
        const target = this as EventTarget & Partial<HTMLElement> & Partial<Document> & Partial<Window>;
        recorder.__storeFlowListeners?.push({
          type,
          targetTag: "tagName" in target && typeof target.tagName === "string" ? target.tagName.toLowerCase() : "",
          targetId: "id" in target && typeof target.id === "string" ? target.id : "",
          targetName:
            "getAttribute" in target && typeof target.getAttribute === "function" ? target.getAttribute("name") ?? "" : "",
          targetRole:
            "getAttribute" in target && typeof target.getAttribute === "function" ? target.getAttribute("role") ?? "" : ""
        });
      }

      return originalAddEventListener.call(this, type, listener, options);
    };

    (window as typeof window & { [key: string]: unknown })[globalKey] = recorder.__storeFlowListeners;
  });
}

async function collectElementState(frame: Frame, locator: Locator): Promise<ElementState> {
  const state = await locator.evaluate((element) => {
    const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const rect = element.getBoundingClientRect();
    const active = document.activeElement as HTMLElement | null;

    return {
      value: "value" in control ? control.value : null,
      disabled: "disabled" in control ? Boolean(control.disabled) : false,
      readOnly: "readOnly" in control ? Boolean(control.readOnly) : false,
      required: "required" in control ? Boolean(control.required) : false,
      type: "type" in control ? control.type ?? "" : "",
      inputMode: "inputMode" in control ? control.inputMode ?? "" : "",
      maxLength: "maxLength" in control ? control.maxLength ?? -1 : -1,
      minLength: "minLength" in control ? control.minLength ?? -1 : -1,
      pattern: "pattern" in control ? control.pattern ?? "" : "",
      ariaDisabled: control.getAttribute("aria-disabled"),
      className: "className" in control ? String(control.className ?? "") : "",
      validationMessage: "validationMessage" in control ? control.validationMessage ?? "" : "",
      checkValidity: "checkValidity" in control ? control.checkValidity() : true,
      activeElement: active
        ? {
            tag: active.tagName.toLowerCase(),
            id: active.id ?? "",
            name: active.getAttribute("name") ?? "",
            type: "type" in active ? (active as HTMLInputElement).type ?? "" : ""
          }
        : null,
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  });

  return state;
}

async function collectButtonState(locator: Locator): Promise<ButtonState> {
  const state = await locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const control = element as HTMLButtonElement | HTMLInputElement;
    const rect = element.getBoundingClientRect();

    return {
      text: (htmlElement.innerText || htmlElement.textContent || control.value || "").replace(/\s+/g, " ").trim(),
      disabled: "disabled" in control ? Boolean(control.disabled) : false,
      ariaDisabled: element.getAttribute("aria-disabled"),
      className: htmlElement.className ?? "",
      checkVisibility: rect.width > 0 && rect.height > 0,
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  });

  return state;
}

function normalizeListenerSummary(raw: RawListenerSummary): ListenerSummary {
  return {
    registeredListeners: raw.registeredListeners.map((listener) => ({
      type: listener.type ?? "",
      targetTag: listener.targetTag ?? "",
      targetId: listener.targetId ?? "",
      targetName: listener.targetName ?? "",
      targetRole: listener.targetRole ?? ""
    })),
    inputInlineHandlers: raw.inputInlineHandlers,
    buttonInlineHandlers: raw.buttonInlineHandlers,
    formInlineHandlers: raw.formInlineHandlers
  };
}

async function collectListenerSummaryForIndexes(frame: Frame, inputIndex: number, buttonIndex: number): Promise<ListenerSummary> {
  const raw = await frame.evaluate(
    ({ resolvedInputIndex, resolvedButtonIndex }) => {
      const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
      const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]'));
      const input = inputs[resolvedInputIndex] as HTMLElement | undefined;
      const button = buttons[resolvedButtonIndex] as HTMLElement | undefined;
      const form = input && "form" in input ? ((input as HTMLInputElement).form as HTMLFormElement | null) : null;

      const readHandlers = (element: HTMLElement | HTMLFormElement | null) => ({
        onfocus: Boolean(element && "onfocus" in element && element.onfocus),
        oninput: Boolean(element && "oninput" in element && element.oninput),
        onchange: Boolean(element && "onchange" in element && element.onchange),
        onblur: Boolean(element && "onblur" in element && element.onblur),
        onkeypress: Boolean(element && "onkeypress" in element && element.onkeypress),
        onkeydown: Boolean(element && "onkeydown" in element && element.onkeydown),
        onkeyup: Boolean(element && "onkeyup" in element && element.onkeyup),
        onclick: Boolean(element && "onclick" in element && element.onclick),
        onsubmit: Boolean(element && "onsubmit" in element && element.onsubmit)
      });

      return {
        registeredListeners: ((window as typeof window & { __storeFlowListeners?: Array<Record<string, string>> }).__storeFlowListeners ?? []).slice(
          -200
        ),
        inputInlineHandlers: readHandlers(input ?? null),
        buttonInlineHandlers: readHandlers(button ?? null),
        formInlineHandlers: readHandlers(form)
      };
    },
    { resolvedInputIndex: inputIndex, resolvedButtonIndex: buttonIndex }
  );

  return normalizeListenerSummary(raw);
}

async function saveScreenshot(page: Page, outputDir: string, fileName: string, aliasFileName?: string) {
  const targetPath = path.join(outputDir, fileName);
  await page.screenshot({ path: targetPath, fullPage: true });
  console.log(`Saved screenshot: ${targetPath}`);

  if (aliasFileName) {
    const aliasPath = path.join(outputDir, aliasFileName);
    fs.copyFileSync(targetPath, aliasPath);
    console.log(`Saved screenshot alias: ${aliasPath}`);
  }
}

async function detectPageBasics(page: Page) {
  const inputs = await listInputs(page);
  const buttons = await listButtons(page);
  const iframes = await listIframes(page);

  console.log("Detected inputs:");
  console.log(formatJson(inputs));
  console.log("Detected buttons:");
  console.log(formatJson(buttons));
  console.log("Detected iframes:");
  console.log(formatJson(iframes));
}

async function typeUsingKeyboard(page: Page, inputLocator: Locator, storeCode: string) {
  await inputLocator.click({ timeout: 10_000 });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(storeCode, { delay: 140 });
}

async function fillAndDispatchEvents(inputLocator: Locator, storeCode: string) {
  await inputLocator.click({ timeout: 10_000 });
  await inputLocator.fill(storeCode, { timeout: 10_000 });
  await inputLocator.evaluate((element) => {
    const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    control.focus();
    control.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.blur();
    control.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  });
}

async function submitParentForm(inputLocator: Locator) {
  await inputLocator.evaluate((element) => {
    const form = (element as HTMLInputElement).form;
    if (!form) {
      throw new Error("Input has no parent form.");
    }

    form.submit();
  });
}

async function waitAfterAction(page: Page) {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForTimeout(5_000);
}

async function runAttempt({
  browser,
  surveyUrl,
  storeCode,
  outputDir,
  attempt,
  createCompatibilityAliases
}: {
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  surveyUrl: string;
  storeCode: string;
  outputDir: string;
  attempt: AttemptConfig;
  createCompatibilityAliases: boolean;
}): Promise<AttemptResult> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  const navigationEvents: string[] = [];

  await installListenerProbe(page);

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
    console.log(`\n=== Attempt: ${attempt.name} (${attempt.mode}) ===`);
    await page.goto(surveyUrl, { waitUntil: "load", timeout: 60_000 });
    await page.waitForLoadState("load");

    await detectPageBasics(page);

    const safeAttemptName = sanitizeFileName(attempt.name);
    await saveScreenshot(
      page,
      outputDir,
      `initial-${safeAttemptName}.png`,
      createCompatibilityAliases ? "initial.png" : undefined
    );

    const bestInput = await findBestInput(page);
    if (!bestInput) {
      throw new Error("No visible editable input candidate found.");
    }

    const entryButton = await findEntryButton(page);
    if (!entryButton) {
      throw new Error('No "Entrar" button candidate found.');
    }

    const inputLocator = bestInput.frame.locator("input, textarea, select").nth(bestInput.index);
    const buttonLocator = entryButton.frame
      .locator('button, input[type="button"], input[type="submit"], [role="button"]')
      .nth(entryButton.index);

    if (!(await isLocatorVisible(inputLocator))) {
      throw new Error(`Input candidate is no longer visible: ${bestInput.selector}`);
    }

    const inputStateBefore = await collectElementState(bestInput.frame, inputLocator);
    const buttonStateBefore = await collectButtonState(buttonLocator);

    console.log("Selected input candidate:");
    console.log(
      formatJson({
        frameName: bestInput.frameName,
        frameUrl: bestInput.frameUrl,
        selector: bestInput.selector,
        score: bestInput.score,
        name: bestInput.name,
        id: bestInput.id,
        placeholder: bestInput.placeholder,
        type: bestInput.type,
        surroundingText: bestInput.surroundingText
      })
    );

    console.log("Selected entry button:");
    console.log(
      formatJson({
        frameName: entryButton.frameName,
        frameUrl: entryButton.frameUrl,
        selector: entryButton.selector,
        score: entryButton.score,
        text: entryButton.text,
        id: entryButton.id,
        name: entryButton.name
      })
    );

    if (attempt.mode === "keyboard_tab_click") {
      await typeUsingKeyboard(page, inputLocator, storeCode);
    } else if (attempt.mode === "fill_events_click") {
      await fillAndDispatchEvents(inputLocator, storeCode);
    } else {
      await inputLocator.click({ timeout: 10_000 });
      await inputLocator.fill(storeCode, { timeout: 10_000 });
    }

    const inputStateAfterFill = await collectElementState(bestInput.frame, inputLocator);
    const buttonStateAfterFill = await collectButtonState(buttonLocator);
    const listenerSummary = await collectListenerSummaryForIndexes(bestInput.frame, bestInput.index, entryButton.index);

    console.log("Post-fill validation:");
    console.log(
      formatJson({
        inputStateBefore,
        inputStateAfterFill,
        buttonStateBefore,
        buttonStateAfterFill,
        listenerSummary
      })
    );

    await saveScreenshot(
      page,
      outputDir,
      `after-fill-${safeAttemptName}.png`,
      createCompatibilityAliases ? "filled.png" : attempt.mode === "fill_click" ? "after-fill.png" : undefined
    );

    if (attempt.mode === "keyboard_tab_click") {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(800);
      await saveScreenshot(
        page,
        outputDir,
        `after-tab-${safeAttemptName}.png`,
        createCompatibilityAliases ? "after-tab.png" : undefined
      );
      await buttonLocator.click({ timeout: 10_000 });
      await waitAfterAction(page);
    } else if (attempt.mode === "fill_enter") {
      await inputLocator.press("Enter");
      await waitAfterAction(page);
      await saveScreenshot(
        page,
        outputDir,
        `after-enter-${safeAttemptName}.png`,
        createCompatibilityAliases ? "after-enter.png" : undefined
      );
    } else if (attempt.mode === "form_submit") {
      await submitParentForm(inputLocator);
      await waitAfterAction(page);
      await saveScreenshot(
        page,
        outputDir,
        `after-submit-${safeAttemptName}.png`,
        createCompatibilityAliases ? "after-submit.png" : undefined
      );
    } else {
      await buttonLocator.click({ timeout: 10_000 });
      await waitAfterAction(page);
      await saveScreenshot(
        page,
        outputDir,
        `after-click-${safeAttemptName}.png`,
        createCompatibilityAliases ? "after-click.png" : undefined
      );
    }

    const inputStateAfterAction = await collectElementState(bestInput.frame, inputLocator).catch(() => inputStateAfterFill);
    const buttonStateAfterAction = await collectButtonState(buttonLocator).catch(() => buttonStateAfterFill);
    const finalUrl = page.url();
    const finalTitle = await page.title().catch(() => "");

    const result: AttemptResult = {
      attempt: attempt.name,
      mode: attempt.mode,
      finalUrl,
      finalTitle,
      navigationOccurred: finalUrl !== surveyUrl || navigationEvents.length > 1,
      navigationEvents,
      inputStateBefore,
      inputStateAfterFill,
      inputStateAfterAction,
      buttonStateBefore,
      buttonStateAfterFill,
      buttonStateAfterAction,
      listenerSummary,
      errors
    };

    console.log("Attempt result:");
    console.log(formatJson(result));

    return result;
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function main() {
  loadLocalEnvFile(path.join(process.cwd(), ".env.local"));
  loadLocalEnvFile(path.join(process.cwd(), ".env"));

  const surveyUrl = getArgValue("url") ?? process.env.NEXT_PUBLIC_SURVEY_URL;
  const storeCode = getArgValue("store-code") ?? process.env.STORE_FLOW_STORE_CODE ?? process.env.NEXT_PUBLIC_STORE_CODE;

  if (!surveyUrl) {
    throw new Error("Missing survey URL. Use --url=<real-survey-url> or set NEXT_PUBLIC_SURVEY_URL in .env.local.");
  }

  if (!storeCode) {
    throw new Error("Missing real store code. Use --store-code=<real-store-code> or set STORE_FLOW_STORE_CODE in .env.local.");
  }

  const outputDir = path.join(process.cwd(), "output", "playwright", "store-flow");
  ensureDir(outputDir);

  const browser = await chromium.launch({ headless: true });

  try {
    const attempts: AttemptConfig[] = [
      { name: "fill-click", mode: "fill_click" },
      { name: "fill-enter", mode: "fill_enter" },
      { name: "keyboard-tab-click", mode: "keyboard_tab_click" },
      { name: "fill-events-click", mode: "fill_events_click" },
      { name: "form-submit", mode: "form_submit" }
    ];

    const results: AttemptResult[] = [];

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const result = await runAttempt({
          browser,
          surveyUrl,
          storeCode,
          outputDir,
          attempt,
          createCompatibilityAliases: index === 0
        });
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(message);
      }
    }

    console.log("\n=== Final summary ===");
    console.log(formatJson(results));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
