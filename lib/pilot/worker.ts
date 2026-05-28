import { chromium, type Locator, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { fetchBinaryImage } from "@/lib/image";
import { runVisualAnalysis } from "@/lib/analysis/run-visual-analysis";
import {
  createBrowserEvent,
  createImageRecord,
  createQuestionRecord,
  getSurveyRunDetails,
  updateSurveyRun,
  upsertAnswerRecord
} from "@/lib/pilot/db";
import { createSignedStorageUrl, uploadBufferToStorage, uploadJsonArtifact } from "@/lib/pilot/storage";
import { mergePilotBrowserConfig } from "@/lib/pilot/config";
import type { ExtractedSurveyImage, SurveySelectorConfig } from "@/lib/pilot/types";

class PilotFlowError extends Error {
  readonly details?: Record<string, unknown>;
  readonly debugContext?: Record<string, unknown>;

  constructor(
    message: string,
    readonly runStatus: "failed" | "needs_selector_calibration" | "human_review",
    readonly step: string,
    options?: {
      cause?: unknown;
      details?: Record<string, unknown>;
      debugContext?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "PilotFlowError";
    this.details = options?.details;
    this.debugContext = options?.debugContext;

    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

type SerializedError = {
  message: string;
  stack: string | null;
  name: string;
  cause: unknown;
  playwright: Record<string, unknown> | null;
};

type WorkerRuntimeState = {
  currentStep: string;
  lastSelector: string | null;
  lastScreenshotPath: string | null;
  currentUrl: string | null;
  currentTitle: string | null;
};

type VisibleMatch = {
  locator: Locator;
  selector: string;
};

type SelectorResolution = VisibleMatch & {
  strategy: "configured" | "fallback";
  fallbackLabel?: string;
  attemptedSelectors: string[];
  failedSelectors: string[];
};

type FillAttemptResult = {
  method: "fill";
  valueBefore: string;
  valueAfter: string;
};

type ScreenInputDiagnostic = {
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  visible: boolean;
  disabled: boolean;
};

type ScreenButtonDiagnostic = {
  tag: string;
  text: string;
  type: string;
  name: string;
  id: string;
  value: string;
  visible: boolean;
  disabled: boolean;
};

type ScreenDiagnostics = {
  url: string;
  title: string;
  htmlPartial: string;
  inputs: ScreenInputDiagnostic[];
  buttons: ScreenButtonDiagnostic[];
};

type InputCandidate = ScreenInputDiagnostic & {
  index: number;
  selector: string;
  readonly: boolean;
  opacity: string;
  formId: string;
  surroundingText: string;
};

type ExtractedOption = {
  text: string;
  locator: Locator;
  selectorSource: string;
};

type ScreenState =
  | {
      kind: "initial";
      imageLinks: string[];
      matchedImageSelectors: string[];
    }
  | {
      kind: "validator";
      imageLinks: string[];
      matchedImageSelectors: string[];
    }
  | {
      kind: "images";
      imageLinks: string[];
      matchedImageSelectors: string[];
    }
  | {
      kind: "question";
      imageLinks: string[];
      matchedImageSelectors: string[];
    }
  | {
      kind: "used_images";
      imageLinks: string[];
      matchedImageSelectors: string[];
    }
  | {
      kind: "completion";
      imageLinks: string[];
      matchedImageSelectors: string[];
    }
  | {
      kind: "unknown";
      imageLinks: string[];
      matchedImageSelectors: string[];
    };

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildHtmlArtifactPath(runId: string, name: string) {
  return path.posix.join("runs", runId, "artifacts", `${name}.html`);
}

function shouldDisableHtmlArtifactUpload(step?: string) {
  if (!step) {
    return false;
  }

  return step === "opening_survey" || step === "diagnostics";
}

function buildWorkerTraceContext(
  runId: string,
  currentStep: string,
  extra?: {
    sourceUrl?: string;
    contentType?: string;
    artifactType?: string;
    fileName?: string;
    functionName?: string;
  }
) {
  return {
    runId,
    currentStep,
    sourceUrl: extra?.sourceUrl,
    contentType: extra?.contentType,
    artifactType: extra?.artifactType,
    fileName: extra?.fileName,
    functionName: extra?.functionName
  };
}

function logUploadCall(traceContext: {
  runId: string;
  currentStep: string;
  functionName: string;
  artifactType: string;
  contentType: string;
  fileName: string;
}) {
  console.log(
    JSON.stringify({
      scope: "lib/pilot/worker",
      event: "uploadBufferToStorage:caller",
      callerFunction: traceContext.functionName,
      artifactType: traceContext.artifactType,
      mime: traceContext.contentType,
      filename: traceContext.fileName,
      currentStep: traceContext.currentStep,
      runId: traceContext.runId,
      timestamp: new Date().toISOString()
    })
  );
}

function serializeUnknownError(error: unknown, seen = new WeakSet<object>()): SerializedError {
  if (error instanceof Error) {
    return {
      message: error.message || String(error),
      stack: error.stack ?? null,
      name: error.name || "Error",
      cause: serializeErrorCause((error as Error & { cause?: unknown }).cause, seen),
      playwright: serializePlaywrightError(error)
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown error",
    stack: null,
    name: typeof error,
    cause: serializeErrorCause(error, seen),
    playwright: null
  };
}

function serializeErrorCause(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    if (seen.has(value)) {
      return {
        name: value.name,
        message: value.message,
        circular: true
      };
    }

    seen.add(value);
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
      cause: serializeErrorCause((value as Error & { cause?: unknown }).cause, seen)
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => serializeErrorCause(item, seen));
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeErrorCause(nestedValue, seen)])
    );
  }

  return String(value);
}

function serializePlaywrightError(error: Error) {
  const candidate = error as Error & {
    timeout?: number;
    method?: string;
    logs?: string;
    apiName?: string;
    value?: unknown;
  };

  const payload = {
    timeout: typeof candidate.timeout === "number" ? candidate.timeout : null,
    method: typeof candidate.method === "string" ? candidate.method : null,
    apiName: typeof candidate.apiName === "string" ? candidate.apiName : null,
    logs: typeof candidate.logs === "string" ? candidate.logs : null,
    value: candidate.value !== undefined ? serializeErrorCause(candidate.value) : null
  };

  return Object.values(payload).some((value) => value !== null) ? payload : null;
}

async function refreshRuntimePageState(state: WorkerRuntimeState, page: Page) {
  state.currentUrl = page.url();
  state.currentTitle = await page.title().catch(() => state.currentTitle ?? "");
}

async function firstVisible(page: Page, selectors: string[]): Promise<VisibleMatch | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        if (await locator.isVisible()) {
          return {
            locator,
            selector
          };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function fillFirstAvailable(page: Page, selectors: string[], value: string) {
  const match = await firstVisible(page, selectors);

  if (!match) {
    throw new Error(`No se encontró un input para completar valor: ${value}.`);
  }

  await match.locator.fill(value);
  return match;
}

async function clickNext(page: Page, selectors: string[]) {
  const match = await firstVisible(page, selectors);

  if (!match) {
    throw new Error("No se encontró botón para avanzar.");
  }

  await match.locator.click();
  return match;
}

async function collectScreenDiagnostics(page: Page): Promise<ScreenDiagnostics> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const htmlPartial = await page
    .locator("body")
    .evaluate((element) => (element instanceof HTMLElement ? element.outerHTML.slice(0, 50_000) : ""))
    .catch(() => "");

  const inputs: ScreenInputDiagnostic[] = [];
  const inputLocator = page.locator("input, textarea, select");
  const inputCount = await inputLocator.count();

  for (let index = 0; index < inputCount; index += 1) {
    const input = await inputLocator
      .nth(index)
      .evaluate((element) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          type: "type" in control ? control.type ?? "" : "",
          name: control.getAttribute("name") ?? "",
          id: control.id ?? "",
          placeholder: control.getAttribute("placeholder") ?? "",
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.opacity !== "0",
          disabled: "disabled" in control ? Boolean(control.disabled) : false
        };
      })
      .catch(() => null);

    if (input) {
      inputs.push(input);
    }
  }

  const buttons: ScreenButtonDiagnostic[] = [];
  const buttonLocator = page.locator('button, input[type="submit"], input[type="button"]');
  const buttonCount = await buttonLocator.count();

  for (let index = 0; index < buttonCount; index += 1) {
    const button = await buttonLocator
      .nth(index)
      .evaluate((element) => {
        const control = element as HTMLButtonElement | HTMLInputElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          text: element instanceof HTMLButtonElement ? element.innerText.trim() : "",
          type: "type" in control ? control.type ?? "" : "",
          name: control.getAttribute("name") ?? "",
          id: control.id ?? "",
          value: "value" in control ? control.value ?? "" : "",
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.opacity !== "0",
          disabled: "disabled" in control ? Boolean(control.disabled) : false
        };
      })
      .catch(() => null);

    if (button) {
      buttons.push(button);
    }
  }

  return {
    url,
    title,
    htmlPartial,
    inputs,
    buttons
  };
}

async function uploadHtmlArtifact({
  runId,
  name,
  html,
  step
}: {
  runId: string;
  name: string;
  html: string;
  step?: string;
}) {
  const filePath = buildHtmlArtifactPath(runId, name);
  const shouldSkipUpload = shouldDisableHtmlArtifactUpload(step);
  const traceContext = buildWorkerTraceContext(runId, step ?? "unknown", {
    contentType: "text/html; charset=utf-8",
    artifactType: "html_artifact",
    fileName: filePath,
    functionName: "uploadHtmlArtifact"
  });

  logUploadCall({
    runId,
    currentStep: step ?? "unknown",
    functionName: "uploadHtmlArtifact",
    artifactType: "html_artifact",
    contentType: "text/html; charset=utf-8",
    fileName: filePath
  });

  if (shouldSkipUpload) {
    console.warn(
      JSON.stringify({
        scope: "lib/pilot/worker",
        event: "uploadHtmlArtifact:skipped",
        callerFunction: "uploadHtmlArtifact",
        artifactType: "html_artifact",
        mime: "text/html; charset=utf-8",
        filename: filePath,
        currentStep: step ?? "unknown",
        runId,
        reason: "html_artifact_upload_temporarily_disabled_for_step",
        timestamp: new Date().toISOString()
      })
    );

    return null;
  }

  await uploadBufferToStorage({
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    filePath,
    buffer: Buffer.from(html, "utf8"),
    contentType: "text/html; charset=utf-8",
    traceContext
  });

  return {
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    path: filePath
  };
}

async function recordScreenDiagnostics({
  page,
  runId,
  step,
  name,
  message,
  metadata = {}
}: {
  page: Page;
  runId: string;
  step: string;
  name: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const screenshot = await captureActionScreenshot({
    page,
    runId,
    step,
    action: name,
    message
  });
  const diagnostics = await collectScreenDiagnostics(page);
  const htmlArtifact = await uploadHtmlArtifact({
    runId,
    name,
    html: diagnostics.htmlPartial,
    step
  });
  const jsonArtifact = await uploadJsonArtifact({
    runId,
    name,
    payload: diagnostics,
    traceContext: buildWorkerTraceContext(runId, step)
  });

  await emitWorkerEvent({
    runId,
    level: "warn",
    eventType: "screen_diagnostic_saved",
    step,
    message,
    metadata: {
      ...metadata,
      diagnosticsArtifactPath: jsonArtifact.path,
      htmlArtifactPath: htmlArtifact?.path ?? null,
      detectedInputCount: diagnostics.inputs.length,
      detectedButtonCount: diagnostics.buttons.length,
      detectedInputs: diagnostics.inputs,
      detectedButtons: diagnostics.buttons
    },
    screenshotBucket: STORAGE_BUCKETS.analysisArtifacts,
    screenshotPath: screenshot.storagePath
  });

  return {
    screenshot,
    diagnostics,
    htmlArtifact,
    jsonArtifact
  };
}

function getStoreInputKeywords() {
  return ["codigo", "código", "store", "tienda"];
}

async function collectInputCandidates(page: Page): Promise<{
  totalInputs: number;
  validCandidates: InputCandidate[];
}> {
  const locator = page.locator("input, textarea, select");
  const totalInputs = await locator.count();
  const validCandidates: InputCandidate[] = [];

  for (let index = 0; index < totalInputs; index += 1) {
    const candidate = await locator
      .nth(index)
      .evaluate((element, elementIndex) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const type = "type" in control ? control.type ?? "" : "";
        const parentForm = element.closest("form");
        const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
        const surroundingText = (
          label?.textContent ||
          parentForm?.textContent ||
          element.parentElement?.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 400);

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
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            style.opacity !== "0",
          disabled: "disabled" in control ? Boolean(control.disabled) : false,
          readonly: "readOnly" in control ? Boolean(control.readOnly) : false,
          opacity: style.opacity,
          formId: parentForm?.id ?? "",
          surroundingText
        };
      }, index)
      .catch(() => null);

    if (!candidate) {
      continue;
    }

    const disallowedType = ["hidden", "submit", "button", "checkbox", "radio", "file", "image"].includes(
      candidate.type.toLowerCase()
    );

    if (!candidate.visible || candidate.disabled || candidate.readonly || disallowedType) {
      continue;
    }

    validCandidates.push(candidate);
  }

  return {
    totalInputs,
    validCandidates
  };
}

async function resolveStoreCodeInput(page: Page, _selectors: SurveySelectorConfig) {
  const { totalInputs, validCandidates } = await collectInputCandidates(page);
  const keywords = getStoreInputKeywords();
  const keywordMatch = validCandidates.find((candidate) => {
    const haystack = `${candidate.name} ${candidate.id} ${candidate.placeholder} ${candidate.surroundingText}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });

  const textTypeMatch = validCandidates.find((candidate) => candidate.type.toLowerCase() === "text");
  const formMatch = validCandidates.find((candidate) => candidate.formId);
  const fallbackMatch = validCandidates[0];
  const finalCandidate = keywordMatch ?? textTypeMatch ?? formMatch ?? fallbackMatch ?? null;

  if (!finalCandidate) {
    return null;
  }

  return {
    locator: page.locator("input, textarea, select").nth(finalCandidate.index),
    selector: finalCandidate.selector,
    strategy: keywordMatch ? "configured" : "fallback",
    fallbackLabel: keywordMatch
      ? undefined
      : textTypeMatch
        ? "visible_text_input"
        : formMatch
          ? "first_input_in_main_form"
          : "first_valid_visible_input",
    attemptedSelectors: validCandidates.map((candidate) => candidate.selector),
    failedSelectors: [],
    totalInputs,
    validInputs: validCandidates.map((candidate) => ({
      index: candidate.index,
      selector: candidate.selector,
      tag: candidate.tag,
      type: candidate.type,
      name: candidate.name,
      id: candidate.id,
      placeholder: candidate.placeholder,
      formId: candidate.formId
    }))
  } as SelectorResolution & {
    totalInputs: number;
    validInputs: Array<Record<string, unknown>>;
  };
}

async function pageLooksLikeUsedImages(page: Page) {
  const text = normalizeText(await page.locator("body").innerText());
  return (
    text.includes("imagen usada") ||
    text.includes("imagenes usadas") ||
    text.includes("used image") ||
    text.includes("selecciona las imagenes")
  );
}

async function pageLooksLikeQuestion(page: Page) {
  const radioCount = await page.locator('input[type="radio"], [role="radio"]').count();
  return radioCount > 0;
}

async function pageLooksLikeCompletion(page: Page) {
  const text = normalizeText(await page.locator("body").innerText());
  return (
    text.includes("gracias") ||
    text.includes("confirmacion") ||
    text.includes("confirmación") ||
    text.includes("finalizado") ||
    text.includes("completado")
  );
}

async function extractQuestionText(page: Page) {
  const locators = ["h1", "h2", "h3", "legend", "[role='heading']", "p", "label"];
  for (const selector of locators) {
    const texts = await page.locator(selector).allInnerTexts();
    const candidate = texts.map((item) => item.trim()).find((item) => item.length > 20);
    if (candidate) {
      return candidate;
    }
  }

  return "Pregunta no detectada";
}

async function extractOptions(page: Page, selectors: SurveySelectorConfig) {
  const options: ExtractedOption[] = [];
  const radioInputs = page.locator('input[type="radio"]');
  const radioCount = await radioInputs.count();

  for (let index = 0; index < radioCount; index += 1) {
    const input = radioInputs.nth(index);
    const id = await input.getAttribute("id");
    let labelText = "";
    let labelLocator: Locator | null = null;

    if (id) {
      const label = page.locator(`label[for="${id}"]`).first();
      if (await label.count()) {
        labelText = (await label.innerText()).trim();
        labelLocator = label;
      }
    }

    if (!labelText) {
      const container = input.locator("xpath=ancestor::label[1]").first();
      if (await container.count()) {
        labelText = (await container.innerText()).trim();
        labelLocator = container;
      }
    }

    if (!labelText) {
      labelText = `Opción ${index + 1}`;
    }

    options.push({
      text: labelText,
      locator: labelLocator ?? input,
      selectorSource: id ? `label[for="${id}"]` : "input[type=radio]"
    });
  }

  if (options.length > 0) {
    return options;
  }

  for (const selector of selectors.optionContainerSelectors) {
    const items = page.locator(selector);
    const count = await items.count();

    for (let index = 0; index < count; index += 1) {
      const locator = items.nth(index);
      const text = (await locator.innerText()).trim();
      if (text) {
        options.push({ text, locator, selectorSource: selector });
      }
    }
  }

  return options;
}

async function extractImageLinks(page: Page, selectors: SurveySelectorConfig) {
  const urls = new Set<string>();
  const matchedImageSelectors = new Set<string>();

  for (const selector of selectors.imageSelectors) {
    const handles = await page.locator(selector).evaluateAll((elements) => {
      return elements.reduce<string[]>((collected, element) => {
        if (element instanceof HTMLImageElement) {
          const source = element.currentSrc || element.src;
          if (source) {
            collected.push(source);
          }
          return collected;
        }

        if (element instanceof HTMLAnchorElement) {
          if (element.href) {
            collected.push(element.href);
          }
          return collected;
        }

        return collected;
      }, []);
    });

    for (const handle of handles) {
      if (typeof handle === "string" && handle.startsWith("http")) {
        urls.add(handle);
        matchedImageSelectors.add(selector);
      }
    }
  }

  return {
    urls: [...urls],
    matchedImageSelectors: [...matchedImageSelectors]
  };
}

async function assertFieldValue({
  locator,
  expectedValue,
  fieldName,
  step
}: {
  locator: Locator;
  expectedValue: string;
  fieldName: string;
  step: string;
}) {
  const currentValue = await locator.inputValue().catch(async () => {
    return (await locator.getAttribute("value")) ?? "";
  });

  if (currentValue.trim() !== expectedValue.trim()) {
    throw new PilotFlowError(
      `No se pudo confirmar que el campo ${fieldName} quedó lleno correctamente.`,
      "needs_selector_calibration",
      step
    );
  }
}

async function countDetectedInputs(page: Page) {
  return page.locator("input, textarea, select").count();
}

async function readInputValue(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        return element.value ?? "";
      }

      return element.getAttribute("value") ?? "";
    })
    .catch(async () => (await locator.getAttribute("value")) ?? "");
}

async function tryFillStoreCode(locator: Locator, value: string): Promise<FillAttemptResult> {
  const valueBefore = await readInputValue(locator);
  await locator.click();
  await locator.fill(value);

  const valueAfter = await readInputValue(locator);
  if (valueAfter.trim() === value.trim()) {
    return {
      method: "fill",
      valueBefore,
      valueAfter
    };
  }

  throw new Error("No se pudo escribir el valor usando fill.");
}

async function submitStoreCodeAndWaitForValidator({
  page,
  inputLocator,
  selectors,
  initialUrl
}: {
  page: Page;
  inputLocator: Locator;
  selectors: SurveySelectorConfig;
  initialUrl: string;
}) {
  await inputLocator.focus();
  await inputLocator.press("Enter");

  const startedAt = Date.now();

  while (Date.now() - startedAt < 12_000) {
    await page.waitForLoadState("networkidle").catch(() => null);

    const currentUrl = page.url();
    const urlChanged = currentUrl !== initialUrl;
    const validatorInput = await firstVisible(page, selectors.validatorCodeInputSelectors);

    if (validatorInput) {
      return {
        screen: {
          kind: "validator",
          imageLinks: [],
          matchedImageSelectors: []
        } as ScreenState,
        urlChanged,
        validatorDetected: true,
        validatorSelector: validatorInput.selector,
        currentUrl
      };
    }

    if (urlChanged) {
      const classifiedScreen = await classifyScreen(page, selectors, { skipImages: true });

      return {
        screen: classifiedScreen,
        urlChanged: true,
        validatorDetected: classifiedScreen.kind === "validator",
        validatorSelector: null,
        currentUrl
      };
    }

    await page.waitForTimeout(500);
  }

  throw new PilotFlowError(
    "No se detectó la segunda pantalla después de enviar el store code.",
    "needs_selector_calibration",
    "validator_screen"
  );
}

async function classifyScreen(
  page: Page,
  selectors: SurveySelectorConfig,
  options?: {
    skipImages?: boolean;
  }
): Promise<ScreenState> {
  const skipImages = options?.skipImages ?? false;
  const { urls, matchedImageSelectors } = skipImages
    ? { urls: [] as string[], matchedImageSelectors: [] as string[] }
    : await extractImageLinks(page, selectors);
  const hasStoreInput = Boolean(await firstVisible(page, selectors.storeCodeInputSelectors));
  const hasValidatorInput = Boolean(await firstVisible(page, selectors.validatorCodeInputSelectors));
  const hasEntryButton = Boolean(await firstVisible(page, selectors.entryButtonSelectors));
  const hasStartSurveyButton = Boolean(await firstVisible(page, selectors.startSurveyButtonSelectors));

  if (hasStoreInput && hasEntryButton && !urls.length && !hasStartSurveyButton) {
    return {
      kind: "initial",
      imageLinks: urls,
      matchedImageSelectors
    };
  }

  if (hasValidatorInput && (urls.length > 0 || hasStartSurveyButton)) {
    return {
      kind: "validator",
      imageLinks: urls,
      matchedImageSelectors
    };
  }

  if (await pageLooksLikeUsedImages(page)) {
    return {
      kind: "used_images",
      imageLinks: urls,
      matchedImageSelectors
    };
  }

  if (await pageLooksLikeCompletion(page)) {
    return {
      kind: "completion",
      imageLinks: urls,
      matchedImageSelectors
    };
  }

  if (await pageLooksLikeQuestion(page)) {
    return {
      kind: "question",
      imageLinks: urls,
      matchedImageSelectors
    };
  }

  if (urls.length > 0) {
    return {
      kind: "images",
      imageLinks: urls,
      matchedImageSelectors
    };
  }

  return {
    kind: "unknown",
    imageLinks: urls,
    matchedImageSelectors
  };
}

async function waitForExpectedScreen({
  page,
  selectors,
  expectedKinds,
  timeoutMs,
  failureStep,
  failureMessage,
  skipImages = false
}: {
  page: Page;
  selectors: SurveySelectorConfig;
  expectedKinds: ScreenState["kind"][];
  timeoutMs: number;
  failureStep: string;
  failureMessage: string;
  skipImages?: boolean;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForLoadState("networkidle").catch(() => null);
    const screen = await classifyScreen(page, selectors, { skipImages });

    if (expectedKinds.includes(screen.kind)) {
      return screen;
    }

    await page.waitForTimeout(750);
  }

  throw new PilotFlowError(failureMessage, "needs_selector_calibration", failureStep);
}

async function captureAndUploadScreenshot({
  page,
  runId,
  fileName,
  bucket,
  step
}: {
  page: Page;
  runId: string;
  fileName: string;
  bucket: string;
  step?: string;
}) {
  const buffer = await page.screenshot({
    fullPage: true,
    type: "png"
  });
  const storagePath = path.posix.join("runs", runId, "screenshots", fileName);
  const traceContext = buildWorkerTraceContext(runId, step ?? "unknown", {
    contentType: "image/png",
    artifactType: "screenshot",
    fileName: storagePath,
    functionName: "captureAndUploadScreenshot"
  });

  logUploadCall({
    runId,
    currentStep: step ?? "unknown",
    functionName: "captureAndUploadScreenshot",
    artifactType: "screenshot",
    contentType: "image/png",
    fileName: storagePath
  });

  await uploadBufferToStorage({
    bucket,
    filePath: storagePath,
    buffer,
    contentType: "image/png",
    traceContext
  });

  return {
    buffer,
    storagePath
  };
}

async function setCurrentBrowserScreenshot({
  runId,
  bucket,
  storagePath
}: {
  runId: string;
  bucket: string;
  storagePath: string;
}) {
  await updateSurveyRun(runId, {
    current_screenshot_bucket: bucket,
    current_screenshot_path: storagePath,
    current_screenshot_updated_at: new Date().toISOString()
  });
}

async function emitWorkerEvent({
  runId,
  eventType,
  step,
  message,
  level = "info",
  metadata = {},
  screenshotBucket,
  screenshotPath
}: {
  runId: string;
  eventType: string;
  step: string;
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  metadata?: Record<string, unknown>;
  screenshotBucket?: string;
  screenshotPath?: string;
}) {
  const timestamp = new Date().toISOString();

  await createBrowserEvent({
    surveyRunId: runId,
    level,
    eventType,
    message,
    details: {
      runId,
      step,
      timestamp,
      ...metadata
    },
    screenshotBucket,
    screenshotPath
  });
}

async function captureActionScreenshot({
  page,
  runId,
  step,
  action,
  message,
  metadata = {},
  runtimeState
}: {
  page: Page;
  runId: string;
  step: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
  runtimeState?: WorkerRuntimeState;
}) {
  const safeAction = action.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const fileName = `live-${Date.now()}-${safeAction}.png`;
  const screenshot = await captureAndUploadScreenshot({
    page,
    runId,
    fileName,
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    step
  });

  await setCurrentBrowserScreenshot({
    runId,
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    storagePath: screenshot.storagePath
  });

  if (runtimeState) {
    runtimeState.currentStep = step;
    runtimeState.lastScreenshotPath = screenshot.storagePath;
    await refreshRuntimePageState(runtimeState, page).catch(() => null);
  }

  await emitWorkerEvent({
    runId,
    eventType: "live_browser_captured",
    step,
    message,
    metadata: {
      action,
      ...metadata
    },
    screenshotBucket: STORAGE_BUCKETS.analysisArtifacts,
    screenshotPath: screenshot.storagePath
  });

  return screenshot;
}

async function captureRawInitialScreenshot({
  page,
  runId,
  step,
  action,
  message,
  metadata = {},
  runtimeState
}: {
  page: Page;
  runId: string;
  step: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
  runtimeState?: WorkerRuntimeState;
}) {
  try {
    const safeAction = action.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
    const buffer = await page.screenshot({
      fullPage: true,
      type: "png"
    });
    const storagePath = path.posix.join("runs", runId, "raw-initial", `${Date.now()}-${safeAction}.png`);
    const traceContext = buildWorkerTraceContext(runId, step, {
      contentType: "image/png",
      artifactType: "raw_initial_screenshot",
      fileName: storagePath,
      functionName: "captureRawInitialScreenshot"
    });

    logUploadCall({
      runId,
      currentStep: step,
      functionName: "captureRawInitialScreenshot",
      artifactType: "raw_initial_screenshot",
      contentType: "image/png",
      fileName: storagePath
    });

    await uploadBufferToStorage({
      bucket: STORAGE_BUCKETS.analysisArtifacts,
      filePath: storagePath,
      buffer,
      contentType: "image/png",
      traceContext
    });

    await setCurrentBrowserScreenshot({
      runId,
      bucket: STORAGE_BUCKETS.analysisArtifacts,
      storagePath
    });

    if (runtimeState) {
      runtimeState.currentStep = step;
      runtimeState.lastScreenshotPath = storagePath;
      await refreshRuntimePageState(runtimeState, page).catch(() => null);
    }

    await emitWorkerEvent({
      runId,
      eventType: "raw_browser_screenshot_saved",
      step,
      message,
      metadata: {
        action,
        screenshotMode: "raw_playwright_png",
        ...metadata
      },
      screenshotBucket: STORAGE_BUCKETS.analysisArtifacts,
      screenshotPath: storagePath
    });
  } catch (error) {
    await emitWorkerEvent({
      runId,
      level: "warn",
      eventType: "raw_browser_screenshot_failed",
      step,
      message: "El screenshot RAW falló, pero el flujo Playwright continúa.",
      metadata: {
        action,
        screenshotMode: "raw_playwright_png",
        detail: error instanceof Error ? error.message : "unknown_screenshot_error"
      }
    }).catch(() => null);
  }
}

function startLiveBrowserView({
  page,
  runId
}: {
  page: Page;
  runId: string;
}) {
  let isUploading = false;

  const interval = setInterval(async () => {
    if (isUploading) {
      return;
    }

    isUploading = true;

    try {
      const buffer = await page.screenshot({
        fullPage: true,
        type: "png"
      });
      const storagePath = path.posix.join("runs", runId, "live", "current.png");
      const traceContext = buildWorkerTraceContext(runId, "live_browser", {
        contentType: "image/png",
        artifactType: "live_browser_screenshot",
        fileName: storagePath,
        functionName: "startLiveBrowserView"
      });

      logUploadCall({
        runId,
        currentStep: "live_browser",
        functionName: "startLiveBrowserView",
        artifactType: "live_browser_screenshot",
        contentType: "image/png",
        fileName: storagePath
      });

      await uploadBufferToStorage({
        bucket: STORAGE_BUCKETS.analysisArtifacts,
        filePath: storagePath,
        buffer,
        contentType: "image/png",
        traceContext
      });

      await setCurrentBrowserScreenshot({
        runId,
        bucket: STORAGE_BUCKETS.analysisArtifacts,
        storagePath
      });
    } catch {
      // Ignore screenshot loop errors; explicit run failures are handled elsewhere.
    } finally {
      isUploading = false;
    }
  }, 2000);

  return () => clearInterval(interval);
}

function pickBestAnalysis(
  results: Array<{
    image: ExtractedSurveyImage;
    analysis: Awaited<ReturnType<typeof runVisualAnalysis>>;
  }>
) {
  const confidenceRank = {
    alta: 3,
    media: 2,
    baja: 1
  };

  return [...results].sort((left, right) => {
    const leftApproval = left.analysis.decision_supervisor.status === "approve" ? 1 : 0;
    const rightApproval = right.analysis.decision_supervisor.status === "approve" ? 1 : 0;

    if (leftApproval !== rightApproval) {
      return rightApproval - leftApproval;
    }

    const leftCanAnswer = left.analysis.no_puedo_responder ? 0 : 1;
    const rightCanAnswer = right.analysis.no_puedo_responder ? 0 : 1;

    if (leftCanAnswer !== rightCanAnswer) {
      return rightCanAnswer - leftCanAnswer;
    }

    return confidenceRank[right.analysis.confianza] - confidenceRank[left.analysis.confianza];
  })[0];
}

async function selectBestMatchingOption(
  page: Page,
  selectors: SurveySelectorConfig,
  answerText: string,
  answerLabel: string
) {
  const options = await extractOptions(page, selectors);

  if (options.length === 0) {
    throw new Error("No se detectaron opciones visibles para seleccionar.");
  }

  const normalizedText = normalizeText(answerText);
  const normalizedLabel = normalizeText(answerLabel);

  const directMatch =
    options.find((option) => normalizeText(option.text) === normalizedText) ??
    options.find((option) => normalizeText(option.text) === normalizedLabel) ??
    options.find(
      (option) =>
        normalizeText(option.text).includes(normalizedText) ||
        normalizeText(option.text).includes(normalizedLabel)
    );

  if (!directMatch) {
    throw new Error(`No se pudo mapear la respuesta visible: ${answerText}`);
  }

  await directMatch.locator.click();
  return {
    selectedText: directMatch.text,
    selectorSource: directMatch.selectorSource
  };
}

async function extractFinalCode(page: Page, selectors: SurveySelectorConfig) {
  for (const selector of selectors.finalCodeSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = (await locator.innerText()).trim();
      if (text) {
        return text;
      }
    }
  }

  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/[A-Z0-9]{6,}/);
  return match?.[0] ?? null;
}

async function selectUsedImages(page: Page, selectors: SurveySelectorConfig, usedImages: ExtractedSurveyImage[]) {
  const checkboxes = page.locator(selectors.usedImageCheckboxSelectors.join(", "));
  const count = await checkboxes.count();

  if (count === 1) {
    await checkboxes.first().click();
    return 1;
  }

  let selected = 0;

  for (const image of usedImages) {
    const imageName = image.storagePath.split("/").pop() ?? "";
    const candidate = page.locator(`img[src*="${imageName}"]`).first();
    if (await candidate.count()) {
      const checkbox = candidate.locator("xpath=ancestor::*[self::label or self::div][1]//input[@type='checkbox']").first();
      if (await checkbox.count()) {
        await checkbox.check();
        selected += 1;
      }
    }
  }

  return selected;
}

async function persistExtractedImage(runId: string, sourceUrl: string, index: number, currentStep: string) {
  const remote = await fetchBinaryImage(sourceUrl, buildWorkerTraceContext(runId, currentStep, { sourceUrl }));
  const extension = remote.mimeType.split("/")[1] ?? "jpg";
  const storagePath = path.posix.join("runs", runId, "source-images", `image-${index + 1}.${extension}`);
  const traceContext = buildWorkerTraceContext(runId, currentStep, {
    sourceUrl,
    contentType: remote.mimeType,
    artifactType: "source_image",
    fileName: storagePath,
    functionName: "persistExtractedImage"
  });

  logUploadCall({
    runId,
    currentStep,
    functionName: "persistExtractedImage",
    artifactType: "source_image",
    contentType: remote.mimeType,
    fileName: storagePath
  });

  await uploadBufferToStorage({
    bucket: STORAGE_BUCKETS.surveyImages,
    filePath: storagePath,
    buffer: remote.buffer,
    contentType: remote.mimeType,
    traceContext
  });

  const imageRecordId = await createImageRecord({
    survey_run_id: runId,
    image_role: "source",
    source_url: sourceUrl,
    storage_bucket: STORAGE_BUCKETS.surveyImages,
    storage_path: storagePath,
    metadata: {
      source_url: sourceUrl
    }
  });

  return {
    sourceUrl,
    imageRecordId,
    storagePath,
    signedUrl: await createSignedStorageUrl(STORAGE_BUCKETS.surveyImages, storagePath)
  };
}

export async function runPilotSurvey(runId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: run, error } = await supabase
    .from("survey_runs")
    .select("*, stores(store_code)")
    .eq("id", runId)
    .single();

  if (error) {
    throw error;
  }

  const browserConfig = mergePilotBrowserConfig((run.browser_config as Record<string, unknown>) ?? {});
  const surveyUrl = run.survey_url;
  const validatorCode = run.validator_code ?? "";

  if (!surveyUrl) {
    throw new Error("survey_url no configurado en survey_runs.");
  }

  await emitWorkerEvent({
    runId,
    eventType: "browser_launching",
    step: "browser_launch",
    message: "Iniciando browser Playwright.",
    metadata: {
      headless: browserConfig.headless
    }
  });

  const browser = await chromium.launch({
    headless: browserConfig.headless
  });
  await emitWorkerEvent({
    runId,
    eventType: "browser_launched",
    step: "browser_launch",
    message: "Browser Playwright lanzado.",
    metadata: {
      headless: browserConfig.headless
    }
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const browserSessionId = randomUUID();
  const runtimeState: WorkerRuntimeState = {
    currentStep: "browser_launch",
    lastSelector: null,
    lastScreenshotPath: null,
    currentUrl: null,
    currentTitle: null
  };

  try {
    await updateSurveyRun(runId, {
      status: "running",
      current_step: "initial_screen",
      browser_session_id: browserSessionId,
      started_at: new Date().toISOString()
    });

    await emitWorkerEvent({
      runId,
      eventType: "worker_started",
      step: "worker_boot",
      message: "Worker Playwright iniciado.",
      metadata: {
        surveyUrl: run.survey_url
      }
    });

    await emitWorkerEvent({
      runId,
      level: "warn",
      eventType: "live_browser_disabled",
      step: "initial_screen",
      message: "Live browser disabled.",
      metadata: {
        reason: "initial_phase_isolated"
      }
    });
    await emitWorkerEvent({
      runId,
      level: "warn",
      eventType: "visual_pipeline_skipped",
      step: "initial_screen",
      message: "Visual pipeline skipped.",
      metadata: {
        phase: "initial_screen"
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "raw_screenshot_mode_enabled",
      step: "initial_screen",
      message: "Using raw Playwright screenshot.",
      metadata: {
        phase: "initial_screen"
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "opening_survey",
      step: "opening_survey",
      message: "Abriendo pantalla inicial.",
      metadata: {
        surveyUrl
      }
    });
    await captureRawInitialScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "before-open-survey",
      message: "Vista inicial antes de abrir la encuesta.",
      runtimeState
    });

    runtimeState.currentStep = "opening_survey";
    await page.goto(surveyUrl, {
      waitUntil: "networkidle"
    });
    await refreshRuntimePageState(runtimeState, page);
    await captureRawInitialScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "after-open-survey",
      message: "Encuesta abierta en navegador.",
      runtimeState
    });
    await emitWorkerEvent({
      runId,
      eventType: "survey_opened",
      step: "opening_survey",
      message: "Encuesta abierta en navegador.",
      metadata: {
        surveyUrl
      }
    });

    const initialScreen = await waitForExpectedScreen({
      page,
      selectors: browserConfig.selectors,
      expectedKinds: ["initial"],
      timeoutMs: 10_000,
      failureStep: "initial_screen",
      failureMessage: "No se detectó la pantalla inicial esperada. Se requiere calibración.",
      skipImages: true
    });
    await emitWorkerEvent({
      runId,
      eventType: "screen_detected",
      step: "initial_screen",
      message: "Pantalla detectada.",
      metadata: {
        screen: initialScreen.kind
      }
    });

    const storeCode =
      run.stores && typeof run.stores === "object" && "store_code" in run.stores
        ? String(run.stores.store_code ?? "")
        : "";

    await emitWorkerEvent({
      runId,
      eventType: "store_code_search_started",
      step: "initial_screen",
      message: "Buscando input store_code.",
      metadata: {
        configuredSelectors: browserConfig.selectors.storeCodeInputSelectors,
        detectedInputCount: await countDetectedInputs(page)
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "filling_store_code",
      step: "initial_screen",
      message: "Completando store code.",
      metadata: {
        storeCode
      }
    });
    await captureRawInitialScreenshot({
      page,
      runId,
      step: "initial_screen",
      action: "before-fill-store-code",
      message: "Antes de llenar store code.",
      metadata: {
        storeCode
      },
      runtimeState
    });

    runtimeState.currentStep = "initial_screen";
    const storeCodeMatch = await resolveStoreCodeInput(page, browserConfig.selectors);

    if (!storeCodeMatch) {
      throw new PilotFlowError(
        "No se encontró un campo válido para store code en la pantalla inicial.",
        "needs_selector_calibration",
        "initial_screen"
      );
    }

    if (storeCodeMatch.strategy === "fallback") {
      await emitWorkerEvent({
        runId,
        level: "warn",
        eventType: "selector_fallback_used",
        step: "initial_screen",
        message: "Selector configurado para campo tienda no respondió; se aplicó fallback.",
        metadata: {
          attemptedSelectors: storeCodeMatch.attemptedSelectors,
          failedSelectors: storeCodeMatch.failedSelectors,
          selectorUsed: storeCodeMatch.selector,
          fallbackUsed: storeCodeMatch.fallbackLabel
        }
      });
    }

    await emitWorkerEvent({
      runId,
      eventType: "selector_resolved",
      step: "initial_screen",
      message: "Campo tienda seleccionado para escritura.",
      metadata: {
        selectorUsed: storeCodeMatch.selector,
        resolutionStrategy: storeCodeMatch.strategy,
        fallbackUsed: storeCodeMatch.fallbackLabel ?? null,
        attemptedSelectors: storeCodeMatch.attemptedSelectors,
        failedSelectors: storeCodeMatch.failedSelectors,
        totalInputs:
          "totalInputs" in storeCodeMatch && typeof storeCodeMatch.totalInputs === "number"
            ? storeCodeMatch.totalInputs
            : null,
        validInputs:
          "validInputs" in storeCodeMatch && Array.isArray(storeCodeMatch.validInputs)
            ? storeCodeMatch.validInputs
            : [],
        finalInputChosen: storeCodeMatch.selector
      }
    });

    try {
      runtimeState.lastSelector = storeCodeMatch.selector;
      const valueBefore = await readInputValue(storeCodeMatch.locator);
      await emitWorkerEvent({
        runId,
        eventType: "store_code_fill_attempt",
        step: "initial_screen",
        message: "Intentando fill de store code.",
        metadata: {
          selectorUsed: storeCodeMatch.selector,
          valueBefore
        }
      });
      const fillResult = await tryFillStoreCode(storeCodeMatch.locator, storeCode);
      const confirmedValue = await storeCodeMatch.locator.evaluate((element) => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          return element.value ?? "";
        }

        return element.getAttribute("value") ?? "";
      });
      if (confirmedValue.trim() !== storeCode.trim()) {
        throw new Error("El valor escrito no quedó confirmado en el input.");
      }
      await assertFieldValue({
        locator: storeCodeMatch.locator,
        expectedValue: storeCode,
        fieldName: "store code",
        step: "initial_screen"
      });

      await captureRawInitialScreenshot({
        page,
        runId,
        step: "initial_screen",
        action: "after-fill-store-code",
        message: "Store code visible en el formulario.",
        metadata: {
          storeCode,
          selectorUsed: storeCodeMatch.selector,
          fallbackUsed: storeCodeMatch.fallbackLabel ?? null,
          fillMethod: fillResult.method,
          valueBefore: fillResult.valueBefore,
          valueAfter: fillResult.valueAfter,
          totalInputs:
            "totalInputs" in storeCodeMatch && typeof storeCodeMatch.totalInputs === "number"
              ? storeCodeMatch.totalInputs
              : null,
          validInputs:
            "validInputs" in storeCodeMatch && Array.isArray(storeCodeMatch.validInputs)
              ? storeCodeMatch.validInputs
              : []
        },
        runtimeState
      });
      await emitWorkerEvent({
        runId,
        eventType: "store_code_filled",
        step: "initial_screen",
        message: "Valor escrito confirmado.",
        metadata: {
          storeCode,
          selectorUsed: storeCodeMatch.selector,
          resolutionStrategy: storeCodeMatch.strategy,
          fallbackUsed: storeCodeMatch.fallbackLabel ?? null,
          fillMethod: fillResult.method,
          valueBefore: fillResult.valueBefore,
          valueAfter: fillResult.valueAfter,
          totalInputs:
            "totalInputs" in storeCodeMatch && typeof storeCodeMatch.totalInputs === "number"
              ? storeCodeMatch.totalInputs
              : null,
          validInputs:
            "validInputs" in storeCodeMatch && Array.isArray(storeCodeMatch.validInputs)
              ? storeCodeMatch.validInputs
              : [],
          finalInputChosen: storeCodeMatch.selector
        }
      });
    } catch (error) {
      throw new PilotFlowError(
        "No se pudo escribir y confirmar el store code en la pantalla inicial.",
        "needs_selector_calibration",
        "initial_screen",
        {
          cause: error,
          details: {
            selectorUsed: storeCodeMatch.selector,
            resolutionStrategy: storeCodeMatch.strategy,
            fallbackUsed: storeCodeMatch.fallbackLabel ?? null
          }
        }
      );
    }

    await emitWorkerEvent({
      runId,
      eventType: "submitting_store_code",
      step: "initial_screen",
      message: "Enviando formulario inicial con Enter.",
      metadata: {
        strategy: "fill_plus_enter"
      }
    });
    await captureRawInitialScreenshot({
      page,
      runId,
      step: "initial_screen",
      action: "before-submit-store-code",
      message: "Antes de enviar el formulario inicial.",
      runtimeState
    });

    const initialUrlBeforeSubmit = page.url();
    const validatorTransition = await submitStoreCodeAndWaitForValidator({
      page,
      inputLocator: storeCodeMatch.locator,
      selectors: browserConfig.selectors,
      initialUrl: initialUrlBeforeSubmit
    });
    const validatorScreen = validatorTransition.screen;
    await refreshRuntimePageState(runtimeState, page);

    await captureRawInitialScreenshot({
      page,
      runId,
      step: "validator_screen",
      action: "after-submit-store-code",
      message: "Segunda pantalla detectada.",
      metadata: {
        detectedScreen: validatorScreen.kind,
        urlChanged: validatorTransition.urlChanged,
        validatorDetected: validatorTransition.validatorDetected,
        validatorSelector: validatorTransition.validatorSelector,
        currentUrl: validatorTransition.currentUrl
      },
      runtimeState
    });
    runtimeState.currentStep = "validator_screen";
    runtimeState.lastSelector = validatorTransition.validatorSelector ?? runtimeState.lastSelector;
    await emitWorkerEvent({
      runId,
      eventType: "screen_detected",
      step: "validator_screen",
      message: "Segunda pantalla detectada.",
      metadata: {
        screen: validatorScreen.kind,
        navigationDetected: validatorTransition.urlChanged,
        validatorDetected: validatorTransition.validatorDetected,
        validatorSelector: validatorTransition.validatorSelector,
        currentUrl: validatorTransition.currentUrl
      }
    });

    await updateSurveyRun(runId, {
      status: "paused",
      current_step: "validator_screen",
      current_question_text: null
    });

    await emitWorkerEvent({
      runId,
      eventType: "initial_phase_completed",
      step: "validator_screen",
      message: "Fase inicial validada. Flujo detenido intencionalmente en segunda pantalla.",
      metadata: {
        objective: "store_code_written_and_second_screen_detected"
      }
    });

    return;
    await captureActionScreenshot({
      page,
      runId,
      step: "validator_screen",
      action: "before-fill-validator-code",
      message: "Antes de llenar validator code."
    });
    const validatorCodeMatch = await fillFirstAvailable(
      page,
      browserConfig.selectors.validatorCodeInputSelectors,
      validatorCode
    );
    await assertFieldValue({
      locator: validatorCodeMatch.locator,
      expectedValue: validatorCode,
      fieldName: "validator code",
      step: "validator_screen"
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "validator_screen",
      action: "after-fill-validator-code",
      message: "Validator code visible en la segunda pantalla.",
      metadata: {
        selectorUsed: validatorCodeMatch.selector
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "validator_code_filled",
      step: "validator_screen",
      message: "Campo validator code llenado.",
      metadata: {
        validatorCodeLength: validatorCode.length,
        selectorUsed: validatorCodeMatch.selector
      }
    });

    const imageLinks = validatorScreen.imageLinks;
    await captureActionScreenshot({
      page,
      runId,
      step: "validator_screen",
      action: "image-links-visible",
      message: "Captura cuando aparecen los links de imágenes.",
      metadata: {
        imageLinkCount: imageLinks.length
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "image_links_detected",
      step: "validator_screen",
      message: "Imágenes detectadas.",
      metadata: {
        count: imageLinks.length,
        urls: imageLinks,
        selectorsUsed: validatorScreen.matchedImageSelectors
      }
    });

    const extractedImages: ExtractedSurveyImage[] = [];

    for (const [index, sourceUrl] of imageLinks.entries()) {
      try {
        await emitWorkerEvent({
          runId,
          eventType: "image_download_started",
          step: "validator_screen",
          message: `Descarga iniciada para imagen ${index + 1}.`,
          metadata: {
            imageIndex: index + 1,
            sourceUrl
          }
        });

        const extracted = await persistExtractedImage(runId, sourceUrl, index, "validator_screen");
        extractedImages.push(extracted);
        await emitWorkerEvent({
          runId,
          eventType: "image_download_completed",
          step: "validator_screen",
          message: `Descarga completada para imagen ${index + 1}.`,
          metadata: {
            imageIndex: index + 1,
            sourceUrl,
            imageRecordId: extracted.imageRecordId,
            storagePath: extracted.storagePath
          }
        });
      } catch (imageError: unknown) {
        let imageErrorMessage = "Error descargando imagen.";
        if (imageError && typeof imageError === "object") {
          const imageErrorCandidate = imageError as { message?: unknown };
          if (typeof imageErrorCandidate.message === "string") {
            imageErrorMessage = String(imageErrorCandidate.message);
          }
        }
        await emitWorkerEvent({
          runId,
          level: "warn",
          eventType: "image_extract_failed",
          step: "validator_screen",
          message: imageErrorMessage,
          metadata: {
            sourceUrl
          }
        });
      }
    }

    await emitWorkerEvent({
      runId,
      eventType: "images_uploaded",
      step: "validator_screen",
      message: "Imágenes persistidas en storage.",
      metadata: {
        count: extractedImages.length,
        imageRecordIds: extractedImages.map((image) => image.imageRecordId)
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "clicking_next",
      step: "validator_screen",
      message: "Preparando clic en Iniciar encuesta.",
      metadata: {
        context: "start_survey"
      }
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "validator_screen",
      action: "before-click-start-survey",
      message: "Antes de hacer clic en Iniciar encuesta."
    });
    const startSurveyMatch = await clickNext(page, browserConfig.selectors.startSurveyButtonSelectors);
    const firstQuestionScreen = await waitForExpectedScreen({
      page,
      selectors: browserConfig.selectors,
      expectedKinds: ["question"],
      timeoutMs: 12_000,
      failureStep: "question_boot",
      failureMessage:
        "No se detectó la primera pregunta después de iniciar la encuesta. Se requiere calibración."
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "question_boot",
      action: "after-click-start-survey",
      message: "Primera pregunta detectada.",
      metadata: {
        detectedScreen: firstQuestionScreen.kind
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "next_clicked",
      step: "validator_screen",
      message: "Clic en Iniciar encuesta.",
      metadata: {
        context: "start_survey",
        selectorUsed: startSurveyMatch.selector
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "screen_detected",
      step: "question_boot",
      message: "Primera pregunta detectada.",
      metadata: {
        screen: firstQuestionScreen.kind
      }
    });

    await updateSurveyRun(runId, {
      status: "answering_questions",
      current_step: "question_loop"
    });
    await emitWorkerEvent({
      runId,
      eventType: "pre_analysis_started",
      step: "pre_analysis",
      message: "Preparación del análisis visual iniciada.",
      metadata: {
        extractedImageCount: extractedImages.length
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "pre_analysis_completed",
      step: "pre_analysis",
      message: "Preparación del análisis visual completada.",
      metadata: {
        extractedImageCount: extractedImages.length
      }
    });

    let questionIndex = 0;
    const usedImageMap = new Map<string, ExtractedSurveyImage>();

    while (questionIndex < 100) {
      const currentScreen = await classifyScreen(page, browserConfig.selectors);

      if (currentScreen.kind === "used_images") {
        break;
      }

      if (currentScreen.kind === "completion") {
        break;
      }

      if (currentScreen.kind !== "question") {
        await emitWorkerEvent({
          runId,
          level: "warn",
          eventType: "screen_not_detected",
          step: "question_loop",
          message: "Pantalla no detectada.",
          metadata: {
            questionIndex,
            detectedScreen: currentScreen.kind
          }
        });
        throw new PilotFlowError(
          "No se detectó una pantalla de pregunta válida. Se requiere calibración del survey.",
          "needs_selector_calibration",
          "question_loop"
        );
      }

      const screenshot = await captureAndUploadScreenshot({
        page,
        runId,
        fileName: `question-${questionIndex + 1}.png`,
        bucket: STORAGE_BUCKETS.questionScreenshots,
        step: `question_${questionIndex + 1}`
      });
      await setCurrentBrowserScreenshot({
        runId,
        bucket: STORAGE_BUCKETS.questionScreenshots,
        storagePath: screenshot.storagePath
      });
      await emitWorkerEvent({
        runId,
        eventType: "question_screenshot_saved",
        step: `question_${questionIndex + 1}`,
        message: `Screenshot guardado para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          fileName: `question-${questionIndex + 1}.png`
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "question-visible",
        message: `Pregunta ${questionIndex + 1} visible en el navegador.`,
        metadata: {
          questionIndex
        }
      });

      const questionText = await extractQuestionText(page);
      const options = await extractOptions(page, browserConfig.selectors);

      await updateSurveyRun(runId, {
        current_question_index: questionIndex,
        current_step: `answering_question_${questionIndex}`,
        current_question_text: questionText
      });
      await emitWorkerEvent({
        runId,
        eventType: "question_detected",
        step: `question_${questionIndex + 1}`,
        message: `Pregunta ${questionIndex + 1} detectada.`,
        metadata: {
          questionIndex,
          questionText,
          optionCount: options.length,
          options: options.map((option) => option.text)
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      const questionId = await createQuestionRecord({
        survey_run_id: runId,
        question_index: questionIndex,
        screenshot_bucket: STORAGE_BUCKETS.questionScreenshots,
        screenshot_path: screenshot.storagePath,
        detected_question: questionText,
        options: options.map((option, index) => ({
          label: `option_${index + 1}`,
          text: option.text
        })),
        question_type: "unknown",
        status: "analyzed"
      });

      const analyses = [];
      await emitWorkerEvent({
        runId,
        eventType: "visual_analysis_started",
        step: `question_${questionIndex + 1}`,
        message: `Análisis visual iniciado para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          candidateImageCount: extractedImages.length
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      for (const image of extractedImages) {
        const analysis = await runVisualAnalysis({
          mainImageUrl: image.signedUrl,
          questionnaireImage: screenshot.buffer,
          questionnaireImageMimeType: "image/png",
          questionnaireFilename: `question-${questionIndex + 1}.png`,
          manualQuestion: questionText,
          traceContext: buildWorkerTraceContext(runId, `question_${questionIndex + 1}`, {
            sourceUrl: image.signedUrl,
            contentType: "image/png"
          })
        });

        analyses.push({
          image,
          analysis
        });
      }

      if (analyses.length === 0) {
        throw new Error("No hay imágenes disponibles para analizar la pregunta actual.");
      }

      await emitWorkerEvent({
        runId,
        eventType: "visual_analysis_completed",
        step: `question_${questionIndex + 1}`,
        message: `Análisis visual completado para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          candidateCount: analyses.length
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      await emitWorkerEvent({
        runId,
        eventType: "supervisor_started",
        step: `question_${questionIndex + 1}`,
        message: `Revisión de supervisor iniciada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          candidateCount: analyses.length
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      const best = pickBestAnalysis(analyses);
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "before-select-option",
        message: `Antes de seleccionar respuesta para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          predictedLabel: best.analysis.respuesta_final_label
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "supervisor_completed",
        step: `question_${questionIndex + 1}`,
        message: `Revisión de supervisor completada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          supervisorStatus: best.analysis.decision_supervisor.status,
          hallucinationRisk: best.analysis.decision_supervisor.hallucination_risk,
          selectedImageRecordId: best.image.imageRecordId
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      const selection = await selectBestMatchingOption(
        page,
        browserConfig.selectors,
        best.analysis.respuesta_final_texto,
        best.analysis.respuesta_final_label
      );
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "after-select-option",
        message: `Respuesta seleccionada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          selectedText: selection.selectedText,
          selectorUsed: selection.selectorSource
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "option_selected",
        step: `question_${questionIndex + 1}`,
        message: `Opción seleccionada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          selectedText: selection.selectedText,
          selectedLabel: best.analysis.respuesta_final_label
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      usedImageMap.set(best.image.imageRecordId, best.image);

      await upsertAnswerRecord(questionId, {
        selected_option_label: best.analysis.respuesta_final_label,
        selected_option_text: selection.selectedText,
        internal_response: best.analysis.respuesta,
        confidence: best.analysis.confianza,
        explanation: best.analysis.explicacion,
        reasoning: {
          pregunta_detectada: best.analysis.pregunta_detectada,
          evidencia_visual: best.analysis.evidencia_visual,
          razon_de_mapeo: best.analysis.razon_de_mapeo
        },
        evidence_image_id: best.image.imageRecordId,
        evidence_crop_path: best.analysis.evidencia_trazable.crop_asset,
        evidence_coordinates: best.analysis.evidencia_trazable.coordinates,
        evidence_section: best.analysis.evidencia_trazable.section,
        ocr_evidence: best.analysis.evidencia_trazable.ocr_evidence,
        no_puedo_responder: best.analysis.no_puedo_responder,
        no_puedo_responder_reason: best.analysis.motivo_no_puedo_responder,
        supervisor_status: best.analysis.decision_supervisor.status,
        supervisor_rationale: best.analysis.decision_supervisor.rationale,
        hallucination_risk: best.analysis.decision_supervisor.hallucination_risk,
        final_payload: best.analysis
      });

      await uploadJsonArtifact({
        runId,
        name: `question-${questionIndex + 1}-analysis`,
        traceContext: buildWorkerTraceContext(runId, `question_${questionIndex + 1}`),
        payload: analyses.map((item) => ({
          imageRecordId: item.image.imageRecordId,
          sourceUrl: item.image.sourceUrl,
          result: item.analysis
        }))
      });

      await emitWorkerEvent({
        runId,
        eventType: "question_completed",
        step: `question_${questionIndex + 1}`,
        message: `Pregunta ${questionIndex + 1} completada.`,
        metadata: {
          questionText,
          questionIndex,
          questionId,
          selectedText: selection.selectedText,
          evidenceImageId: best.image.imageRecordId,
          confidence: best.analysis.confianza,
          supervisorStatus: best.analysis.decision_supervisor.status
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      await updateSurveyRun(runId, {
        last_reasoning_summary: best.analysis.explicacion,
        last_selected_option_text: selection.selectedText,
        last_supervisor_decision: best.analysis.decision_supervisor.status
      });

      await emitWorkerEvent({
        runId,
        eventType: "clicking_next",
        step: `question_${questionIndex + 1}`,
        message: `Ejecutando click en siguiente después de pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          context: "after_question_answer"
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "before-click-next-after-question",
        message: `Antes de avanzar tras responder pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex
        }
      });
      const afterQuestionNextMatch = await clickNext(page, browserConfig.selectors.nextButtonSelectors);
      const postQuestionScreen = await waitForExpectedScreen({
        page,
        selectors: browserConfig.selectors,
        expectedKinds: ["question", "used_images", "completion"],
        timeoutMs: 12_000,
        failureStep: `question_${questionIndex + 1}`,
        failureMessage:
          "No se detectó la pantalla posterior a responder la pregunta. Se requiere calibración."
      });
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "after-click-next-after-question",
        message: `Pantalla posterior a la pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          detectedScreen: postQuestionScreen.kind
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "next_clicked",
        step: `question_${questionIndex + 1}`,
        message: "Clic en siguiente.",
        metadata: {
          questionIndex,
          context: "after_question_answer",
          selectorUsed: afterQuestionNextMatch.selector
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "screen_detected",
        step: `question_${questionIndex + 1}`,
        message: "Pantalla detectada.",
        metadata: {
          screen: postQuestionScreen.kind
        }
      });
      questionIndex += 1;
    }

    const endLoopScreen = await classifyScreen(page, browserConfig.selectors);

    if (endLoopScreen.kind === "used_images") {
      await updateSurveyRun(runId, {
        status: "selecting_used_images",
        current_step: "selecting_used_images"
      });
      await emitWorkerEvent({
        runId,
        eventType: "used_images_selection_started",
        step: "selecting_used_images",
        message: "Selección de imágenes usadas iniciada.",
        metadata: {
          candidateCount: usedImageMap.size
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "used-images-screen",
        message: "Pantalla de selección de imágenes usadas."
      });

      const selectedCount = await selectUsedImages(
        page,
        browserConfig.selectors,
        [...usedImageMap.values()]
      );

      await emitWorkerEvent({
        runId,
        eventType: "used_images_selected",
        step: "selecting_used_images",
        message: "Selección de imágenes usadas completada.",
        metadata: {
          selectedCount
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "used-images-selected",
        message: "Selección de imágenes usadas aplicada.",
        metadata: {
          selectedCount
        }
      });

      await emitWorkerEvent({
        runId,
        eventType: "clicking_next",
        step: "selecting_used_images",
        message: "Ejecutando click en siguiente tras seleccionar imágenes usadas.",
        metadata: {
          context: "after_used_images_selection"
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "before-click-next-used-images",
        message: "Antes de avanzar después de seleccionar imágenes usadas."
      });
      const usedImagesNextMatch = await clickNext(page, browserConfig.selectors.nextButtonSelectors);
      const postUsedImagesScreen = await waitForExpectedScreen({
        page,
        selectors: browserConfig.selectors,
        expectedKinds: ["completion"],
        timeoutMs: 12_000,
        failureStep: "selecting_used_images",
        failureMessage:
          "No se detectó una pantalla final válida después de seleccionar imágenes usadas."
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "after-click-next-used-images",
        message: "Pantalla posterior a la selección de imágenes usadas.",
        metadata: {
          detectedScreen: postUsedImagesScreen.kind
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "next_clicked",
        step: "selecting_used_images",
        message: "Clic en siguiente.",
        metadata: {
          context: "after_used_images_selection",
          selectorUsed: usedImagesNextMatch.selector
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "screen_detected",
        step: "selecting_used_images",
        message: "Pantalla detectada.",
        metadata: {
          screen: postUsedImagesScreen.kind
        }
      });
    } else if (endLoopScreen.kind !== "completion") {
      await emitWorkerEvent({
        runId,
        level: "warn",
        eventType: "screen_not_detected",
        step: "completion_gate",
        message: "Pantalla no detectada.",
        metadata: {
          detectedScreen: endLoopScreen.kind
        }
      });
      throw new PilotFlowError(
        "No se pudo confirmar una pantalla final válida. Se requiere revisión humana o calibración.",
        "human_review",
        "completion_gate"
      );
    }

    const completionScreen = await waitForExpectedScreen({
      page,
      selectors: browserConfig.selectors,
      expectedKinds: ["completion"],
      timeoutMs: 5_000,
      failureStep: "completion",
      failureMessage:
        "No se pudo confirmar la pantalla de finalización de la encuesta. Se requiere revisión humana."
    });
    const finalCode = await extractFinalCode(page, browserConfig.selectors);
    await captureActionScreenshot({
      page,
      runId,
      step: "completion",
      action: "final-screen",
      message: "Pantalla final del navegador.",
      metadata: {
        finalCode,
        detectedScreen: completionScreen.kind
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "final_code_detected",
      step: "completion",
      message: "Código final detectado.",
      metadata: {
        finalCode
      }
    });

    if (!finalCode) {
      throw new PilotFlowError(
        "No se pudo detectar el código final de confirmación. Se requiere revisión humana.",
        "human_review",
        "completion"
      );
    }

    await updateSurveyRun(runId, {
      status: "completed",
      current_step: "completed",
      current_question_text: null,
      final_code: finalCode,
      completed_at: new Date().toISOString()
    });

    await emitWorkerEvent({
      runId,
      eventType: "run_completed",
      step: "completion",
      message: "Encuesta completada.",
      metadata: {
        finalCode
      }
    });
  } catch (error) {
    await refreshRuntimePageState(runtimeState, page).catch(() => null);

    const screenshot = await captureAndUploadScreenshot({
      page,
      runId,
      fileName: "fatal-error.png",
      bucket: STORAGE_BUCKETS.errorScreenshots,
      step: runtimeState.currentStep || "failed"
    }).catch(() => null);

    if (screenshot) {
      runtimeState.lastScreenshotPath = screenshot.storagePath;
    }

    const normalizedError =
      error instanceof PilotFlowError
        ? error
        : new PilotFlowError(
            error instanceof Error ? error.message : "Error desconocido en worker.",
            "failed",
            runtimeState.currentStep || "failed",
            {
              cause: error
            }
          );

    const serializedError = serializeUnknownError(normalizedError);
    const htmlPartial = await page.content().then((content) => content.slice(0, 50_000)).catch(() => "");
    const shouldSkipHtmlArtifactUpload = shouldDisableHtmlArtifactUpload(
      runtimeState.currentStep || normalizedError.step
    );

    if (htmlPartial && shouldSkipHtmlArtifactUpload) {
      console.warn(
        JSON.stringify({
          scope: "lib/pilot/worker",
          event: "uploadHtmlArtifact:skipped",
          callerFunction: "runPilotSurvey.catch",
          artifactType: "html_artifact",
          mime: "text/html; charset=utf-8",
          filename: `fatal-error-${Date.now()}.html`,
          currentStep: runtimeState.currentStep || normalizedError.step,
          runId,
          reason: "skip_html_artifact_upload_during_opening_survey",
          timestamp: new Date().toISOString()
        })
      );
    }

    const htmlArtifact = htmlPartial && !shouldSkipHtmlArtifactUpload
      ? await uploadHtmlArtifact({
          runId,
          name: `fatal-error-${Date.now()}`,
          html: htmlPartial,
          step: runtimeState.currentStep || "failed"
        }).catch(() => null)
      : null;
    const failureContext = {
      step: normalizedError.step || runtimeState.currentStep,
      url: runtimeState.currentUrl,
      title: runtimeState.currentTitle,
      lastSelector: runtimeState.lastSelector,
      lastScreenshotPath: runtimeState.lastScreenshotPath,
      htmlArtifactPath: htmlArtifact?.path ?? null
    };

    await updateSurveyRun(runId, {
      status: normalizedError.runStatus,
      current_step: failureContext.step,
      last_error: normalizedError.message,
      error_screenshot_bucket: screenshot ? STORAGE_BUCKETS.errorScreenshots : null,
      error_screenshot_path: screenshot?.storagePath ?? null
    });

    await emitWorkerEvent({
      runId,
      level: "error",
      eventType: "run_failed",
      step: failureContext.step ?? "failed",
      message: normalizedError.message,
      metadata: {
        currentStep: failureContext.step,
        statusAssigned: normalizedError.runStatus,
        url: failureContext.url,
        title: failureContext.title,
        lastSelector: failureContext.lastSelector,
        lastScreenshotPath: failureContext.lastScreenshotPath,
        error: serializedError.message,
        stack: serializedError.stack,
        errorName: serializedError.name,
        cause: serializedError.cause,
        playwright: serializedError.playwright,
        htmlArtifactPath: failureContext.htmlArtifactPath,
        errorDetails: normalizedError.details ?? null
      },
      screenshotBucket: screenshot ? STORAGE_BUCKETS.errorScreenshots : undefined,
      screenshotPath: screenshot?.storagePath
    });

    Object.assign(normalizedError, {
      debugContext: {
        ...failureContext,
        stack: serializedError.stack,
        name: serializedError.name,
        cause: serializedError.cause,
        playwright: serializedError.playwright
      }
    });

    throw normalizedError;
  } finally {
    await browser.close();
    await getSurveyRunDetails(runId).catch(() => null);
  }
}

export async function diagnosePilotRunScreen(runId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: run, error } = await supabase
    .from("survey_runs")
    .select("*, stores(store_code)")
    .eq("id", runId)
    .single();

  if (error) {
    throw error;
  }

  const browserConfig = mergePilotBrowserConfig((run.browser_config as Record<string, unknown>) ?? {});
  const surveyUrl = run.survey_url;

  if (!surveyUrl) {
    throw new Error("survey_url no configurado en survey_runs.");
  }

  await emitWorkerEvent({
    runId,
    eventType: "screen_diagnosis_started",
    step: "diagnostics",
    message: "Diagnóstico de pantalla solicitado.",
    metadata: {
      surveyUrl
    }
  });

  const browser = await chromium.launch({
    headless: browserConfig.headless
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(surveyUrl, {
      waitUntil: "networkidle"
    });
    const screen = await classifyScreen(page, browserConfig.selectors);
    const diagnostic = await recordScreenDiagnostics({
      page,
      runId,
      step: "diagnostics",
      name: `manual-diagnosis-${Date.now()}`,
      message: "Diagnóstico de pantalla capturado.",
      metadata: {
        detectedScreen: screen.kind
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "screen_diagnosis_completed",
      step: "diagnostics",
      message: "Diagnóstico de pantalla completado.",
      metadata: {
        detectedScreen: screen.kind
      }
    });

    return {
      ok: true,
      detectedScreen: screen.kind,
      screenshotPath: diagnostic.screenshot.storagePath,
      screenshotBucket: STORAGE_BUCKETS.analysisArtifacts,
      diagnosticsArtifactPath: diagnostic.jsonArtifact.path,
      htmlArtifactPath: diagnostic.htmlArtifact?.path ?? null,
      inputs: diagnostic.diagnostics.inputs,
      buttons: diagnostic.diagnostics.buttons
    };
  } catch (error) {
    const title = await page.title().catch(() => "");
    const url = page.url();
    const screenshot = await captureAndUploadScreenshot({
      page,
      runId,
      fileName: `diagnostic-error-${Date.now()}.png`,
      bucket: STORAGE_BUCKETS.analysisArtifacts,
      step: "diagnostics"
    }).catch(() => null);

    if (screenshot) {
      await setCurrentBrowserScreenshot({
        runId,
        bucket: STORAGE_BUCKETS.analysisArtifacts,
        storagePath: screenshot.storagePath
      }).catch(() => null);
    }

    await emitWorkerEvent({
      runId,
      level: "error",
      eventType: "screen_diagnosis_failed",
      step: "diagnostics",
      message: error instanceof Error ? error.message : "Diagnóstico de pantalla falló.",
      metadata: {
        url,
        title,
        screenshotPath: screenshot?.storagePath ?? null
      },
      screenshotBucket: screenshot ? STORAGE_BUCKETS.analysisArtifacts : undefined,
      screenshotPath: screenshot?.storagePath
    }).catch(() => null);

    return {
      ok: false,
      error: "diagnostic_failed",
      detail: error instanceof Error ? error.message : "Diagnóstico de pantalla falló.",
      partial: {
        screenshot: screenshot?.storagePath ?? null,
        url,
        title
      }
    };
  } finally {
    await browser.close();
  }
}
