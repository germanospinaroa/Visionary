import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { chromium, type BrowserContext, type Frame, type Locator, type Page } from "playwright";

type MinimalWorkerInput = {
  surveyUrl: string;
  storeCode: string;
  validatorCode: string;
};

type MinimalWorkerHooks = {
  onStepChange?: (event: { step: string; message: string; timestamp: string }) => void | Promise<void>;
  onScreenshotSaved?: (event: {
    step: string;
    fileName: string;
    path: string;
    timestamp: string;
  }) => void | Promise<void>;
  onImageLinksDetected?: (
    imageLinks: Array<{
      index: number;
      href: string;
      text: string;
    }>
  ) => void | Promise<void>;
  onQuestionReady?: (event: {
    probableQuestionText: string | null;
    visibleQuestions: string[];
    radioCount: number;
    finalBodyTextLength: number;
    firstQuestionDetectedAtSecond: number | null;
    pollingIterations: number;
  }) => void | Promise<void>;
};

type SurveyAnsweringQuestion = {
  id: number;
  physicalNumber?: string;
  text?: string;
  referenceImageUrl?: string;
  expectedOptions: string[];
  status: "pending" | "analyzing" | "answered" | "needs_review";
  suggestedAnswer?: string;
  storePhotosUsed?: number[];
};

type NeedsReviewBehavior = "stop" | "select_no_puedo_responder";

type SurveyAnsweringInput = MinimalWorkerInput & {
  questionResults: SurveyAnsweringQuestion[];
  needsReviewBehavior?: NeedsReviewBehavior;
};

type SurveyAnsweringLogEvent =
  | "SURVEY_ANSWERING_STARTED"
  | "VISIBLE_QUESTION_EXTRACTED"
  | "QUESTION_MATCHED"
  | "ANSWER_SELECTED"
  | "CONTINUE_CLICKED"
  | "PHOTO_SELECTION_SCREEN_DETECTED"
  | "WAITING_FOR_PHOTO_SELECTION"
  | "PHOTO_SELECTED"
  | "PHOTO_SELECTION_CONFIRMED"
  | "PHOTO_CONFIRMATION_SCREEN_DETECTED"
  | "SURVEY_FINAL_REVIEW_DETECTED"
  | "SURVEY_SUBMITTED"
  | "SURVEY_COMPLETION_NUMBER_DETECTED"
  | "SURVEY_FINISHED"
  | "NEEDS_REVIEW_QUESTION_MATCH"
  | "NEEDS_REVIEW_OPTION_MATCH"
  | "WARNING_SCREENSHOT_MISSING";

type SurveyAnsweringLog = {
  timestamp: string;
  event: SurveyAnsweringLogEvent;
  detail?: unknown;
};

type SurveyAnsweringFinalState =
  | "WAITING_FOR_PHOTO_SELECTION"
  | "WAITING_FOR_HUMAN_SUBMIT_CONFIRMATION"
  | "SURVEY_FINISHED"
  | "NEEDS_REVIEW_QUESTION_MATCH"
  | "NEEDS_REVIEW_OPTION_MATCH";

type SurveyAnsweringResult = MinimalWorkerResult & {
  finalState: SurveyAnsweringFinalState;
  actionLogs: SurveyAnsweringLog[];
  answeredQuestionIds: number[];
  traceability: SurveyTraceability;
  surveyCompletionNumber: string | null;
  preparedSessionId?: string | null;
};

type TraceabilityIncident = {
  level: "warning";
  stage: string;
  message: string;
  timestamp: string;
};

type QuestionTraceEntry = {
  questionKey: string;
  questionNumber: string;
  matchedQuestionId: number;
  matchedConfidence: number;
  visibleQuestionText: string;
  selectedAnswer: string;
  selectedOptionText: string | null;
  timestamp: string;
  beforeScreenshotPath: string | null;
  selectedScreenshotPath: string | null;
  afterScreenshotPath: string | null;
};

type TraceabilityStage = {
  path: string | null;
  timestamp: string | null;
};

type TraceabilitySelectedPhoto = {
  imageName: string;
  imageIndex: number;
  sourceUrl: string;
  timestamp: string;
};

type TraceabilityCompletionNumber = {
  surveyCompletionNumber: string;
  timestamp: string;
  screenshot: string | null;
};

type SurveyTraceability = {
  auditable: boolean;
  incidents: TraceabilityIncident[];
  questionTraces: QuestionTraceEntry[];
  photoUploadScreen: TraceabilityStage;
  photoSelected: TraceabilityStage;
  photoConfirmationScreen: TraceabilityStage;
  surveyFinalReview: TraceabilityStage;
  surveySubmitted: TraceabilityStage;
  surveyCompletionNumber: TraceabilityCompletionNumber | null;
  surveyFinished: TraceabilityStage;
  selectedPhoto: TraceabilitySelectedPhoto | null;
};

type PreparedHumanSubmitSession = {
  id: string;
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  context: BrowserContext;
  page: Page;
  outputDir: string;
  screenshots: string[];
  traceability: SurveyTraceability;
  actionLogs: SurveyAnsweringLog[];
  answeredQuestionIds: Set<number>;
  baseResult: MinimalWorkerResult;
  createdAt: string;
};

type MinimalWorkerResult = {
  ok: boolean;
  finalUrl: string | null;
  title: string | null;
  currentStep: string;
  imageLinks: Array<{
    index: number;
    href: string;
    text: string;
  }>;
  detectedFirstQuestion: boolean;
  probableQuestionText: string | null;
  pageTextPreview: string;
  frameCount: number;
  frameUrls: string[];
  frameNames: string[];
  pollingIterations: number;
  firstQuestionDetectedAtSecond: number | null;
  finalBodyTextLength: number;
  finalLabelCount: number;
  frames: Array<{
    frameIndex: number;
    frameName: string;
    frameUrl: string;
    textPreview: string;
    radioCount: number;
    textareaCount: number;
    selectCount: number;
    buttonTexts: string[];
    visibleLabels: string[];
  }>;
  visibleInputs: Array<{
    tag: string;
    type: string;
    name: string;
    id: string;
    placeholder: string;
    label: string;
  }>;
  visibleLabels: string[];
  visibleQuestions: string[];
  radioCount: number;
  textareaCount: number;
  selectCount: number;
  pollingDebug: Array<{
    second: number;
    bodyTextLength: number;
    radioCount: number;
    labelCount: number;
    formCount: number;
    tableCount: number;
  }>;
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
const CONTINUE_BUTTON_KEYWORDS = ["continuar", "iniciar", "siguiente", "begin", "start", "continue", "ok"];
const SUBMIT_BUTTON_KEYWORDS = ["enviar", "submit", "finalizar", "terminar", "finish", "guardar", "aceptar"];
const PHOTO_SELECTION_KEYWORDS = [
  "seleccionar foto",
  "seleccione foto",
  "subir foto",
  "cargar foto",
  "upload photo",
  "select photo",
  "seleccione archivo",
  "choose file",
  "examinar",
  "adjuntar foto"
];

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

async function saveScreenshot(
  page: Page,
  outputDir: string,
  fileName: string,
  screenshots: string[],
  hooks?: MinimalWorkerHooks,
  currentStep?: string
) {
  const targetPath = path.join(outputDir, fileName);
  await page.screenshot({ path: targetPath, fullPage: true, type: "png" });
  screenshots.push(targetPath);
  await hooks?.onScreenshotSaved?.({
    step: currentStep ?? "unknown",
    fileName,
    path: targetPath,
    timestamp: new Date().toISOString()
  });
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

async function readInputValue(locator: Locator) {
  return locator
    .evaluate((element) => {
      const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      return "value" in control ? control.value ?? "" : "";
    })
    .catch(() => "");
}

async function extractVisibleImageLinks(page: Page) {
  const anchorResults = await Promise.all(
    page.frames().map(async (frame) => {
      return frame
        .evaluate(() => {
          const isVisible = (element: Element) => {
            const node = element as HTMLElement;
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0"
            );
          };

          return Array.from(document.querySelectorAll("a[href]"))
            .map((element) => {
              const anchor = element as HTMLAnchorElement;
              const rawHref = (anchor.getAttribute("href") ?? "").trim();
              const normalizedText = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
              const surroundingText = (
                anchor.closest("tr")?.textContent ||
                anchor.closest("table")?.textContent ||
                anchor.parentElement?.textContent ||
                ""
              )
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 500);

              return {
                visible: isVisible(anchor),
                rawHref,
                href: anchor.href.trim(),
                text: normalizedText,
                surroundingText
              };
            })
            .filter((anchor) => {
              if (
                !anchor.visible ||
                !anchor.href ||
                anchor.rawHref === "-" ||
                anchor.rawHref.startsWith("javascript:") ||
                anchor.href.startsWith("javascript:")
              ) {
                return false;
              }

              const normalizedText = anchor.text.toLowerCase();
              const normalizedSurroundingText = anchor.surroundingText.toLowerCase();
              const hrefLooksExternal = /^https?:\/\//i.test(anchor.href);
              const hrefLooksLikeFileman = /fileman|clobotics|\/api\/file\//i.test(anchor.href);

              return (
                /^\d{1,2}$/.test(anchor.text) ||
                normalizedText.includes("foto") ||
                normalizedText.includes("photo") ||
                normalizedText.includes("imagen") ||
                normalizedText.startsWith("http://") ||
                normalizedText.startsWith("https://") ||
                /^\d{1,2}\s*:/.test(normalizedSurroundingText) ||
                normalizedSurroundingText.includes("abri los siguientes links") ||
                normalizedSurroundingText.includes("abrí los siguientes links") ||
                hrefLooksLikeFileman ||
                hrefLooksExternal ||
                /\.(jpg|jpeg|png|gif|bmp|webp)(\?|$)/i.test(anchor.href)
              );
            });
        })
        .catch(() => [] as Array<{ rawHref: string; href: string; text: string; surroundingText: string }>);
    })
  );

  const textResults = await Promise.all(
    page.frames().map(async (frame) =>
      frame
        .evaluate(() => {
          const bodyText = document.body?.innerText ?? "";
          return Array.from(bodyText.matchAll(/https?:\/\/[^\s<>"')]+/gi)).map((match) => match[0]);
        })
        .catch(() => [] as string[])
    )
  );

  const normalizedAnchors = anchorResults
    .flat()
    .map((anchor) => ({
      href: anchor.href,
      text: anchor.text || anchor.surroundingText || anchor.href
    }));

  const regexAnchors = Array.from(
    new Set(
      textResults
        .flat()
        .map((href) => href.trim())
        .filter((href) => /^https?:\/\//i.test(href) && /fileman|clobotics|\/api\/file\//i.test(href))
    )
  )
    .filter((href) => !normalizedAnchors.some((anchor) => anchor.href === href))
    .map((href) => ({
      href,
      text: href
    }));

  return [...normalizedAnchors, ...regexAnchors]
    .filter((anchor, index, array) => array.findIndex((candidate) => candidate.href === anchor.href) === index)
    .map((anchor, index) => ({
      index: index + 1,
      href: anchor.href,
      text: anchor.text
    }));
}

async function verifyImageLinks(
  context: BrowserContext,
  imageLinks: Array<{ index: number; href: string; text: string }>
) {
  for (const imageLink of imageLinks) {
    const previewPage = await context.newPage();

    try {
      await previewPage.goto(imageLink.href, { waitUntil: "load", timeout: 30_000 });
      await previewPage.title().catch(() => "");
      previewPage.url();
    } finally {
      await previewPage.close().catch(() => undefined);
    }
  }
}

async function findContinueButton(page: Page) {
  const buttonSelectors = [
    "button",
    "input[type='submit']",
    "input[type='button']",
    "input[type='image']",
    "[role='button']"
  ];

  const candidates: Array<{
    frame: Frame;
    index: number;
    score: number;
  }> = [];

  for (const frame of page.frames()) {
    const locator = frame.locator(buttonSelectors.join(", "));
    const total = await locator.count();

    for (let index = 0; index < total; index += 1) {
      const detected = await locator
        .nth(index)
        .evaluate((element, elementIndex) => {
          const control = element as HTMLInputElement | HTMLButtonElement;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const text = (control.textContent || control.getAttribute("value") || control.getAttribute("aria-label") || "")
            .replace(/\s+/g, " ")
            .trim();

          return {
            index: elementIndex as number,
            text,
            type: "type" in control ? control.type ?? "" : "",
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0",
            disabled:
              "disabled" in control
                ? Boolean(control.disabled)
                : element.getAttribute("aria-disabled") === "true"
          };
        }, index)
        .catch(() => null);

      if (!detected || !detected.visible || detected.disabled) {
        continue;
      }

      const haystack = normalizeText(`${detected.text} ${detected.type}`);
      let score = 0;

      if (CONTINUE_BUTTON_KEYWORDS.some((keyword) => haystack.includes(keyword))) score += 200;
      if (detected.type.toLowerCase() === "submit") score += 40;
      if (detected.text) score += 20;

      candidates.push({
        frame,
        index,
        score
      });
    }
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0] ?? null;
  if (!best) {
    return null;
  }

  return best.frame.locator(buttonSelectors.join(", ")).nth(best.index);
}

type SurveyDomSnapshot = {
  pageTextPreview: string;
  frameCount: number;
  frameUrls: string[];
  frameNames: string[];
  frames: Array<{
    frameIndex: number;
    frameName: string;
    frameUrl: string;
    textPreview: string;
    radioCount: number;
    textareaCount: number;
    selectCount: number;
    buttonTexts: string[];
    visibleLabels: string[];
  }>;
  visibleInputs: Array<{
    tag: string;
    type: string;
    name: string;
    id: string;
    placeholder: string;
    label: string;
  }>;
  visibleLabels: string[];
  visibleQuestions: string[];
  probableQuestionText: string | null;
  radioCount: number;
  textareaCount: number;
  selectCount: number;
  validatorVisible: boolean;
  visibleOptionTexts: string[];
  questionNumber: string | null;
  photoSelectionDetected: boolean;
  fileInputVisible: boolean;
  imageCount: number;
};

function scoreQuestionCandidate(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  let score = 0;

  if (normalized.length >= 18) score += 30;
  if (normalized.length >= 40) score += 20;
  if (normalized.length > 1200) score -= 80;
  if (normalized.length > 700) score -= 30;
  if (/[?:]$/.test(normalized) || normalized.includes("?")) score += 25;
  if (/^\d+[\).\s-]/.test(normalized)) score += 20;
  if (/^\d+[\).\s-].*¿/.test(normalized)) score += 40;
  if (/^\d+[\).\s-].*\?$/.test(normalized)) score += 50;
  if (normalized.includes("no puedo responder")) score -= 10;
  if (/^si\s*->|^no\s*->/i.test(normalized)) score -= 15;
  if (/[a-záéíóúñ]{4,}/i.test(normalized)) score += 10;

  return score;
}

function uniqueTexts(values: string[], limit = 20) {
  return Array.from(new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))).slice(0, limit);
}

function extractQuestionSignalsFromText(rawText: string) {
  const normalizedText = rawText.replace(/\s+/g, " ").trim();
  const firstQuestionMatch =
    normalizedText.match(/\b1[.\-)\s]+(.{20,1200}?\?)/i) ??
    normalizedText.match(/\b1[.\-)\s]+(.{20,1200}?)(?=\s+NO\s*->|\s+SI\s*->|\s+No puedo responder)/i);

  const probableQuestionText = firstQuestionMatch
    ? `1. ${firstQuestionMatch[1].replace(/\s+/g, " ").trim()}`
    : null;

  const noOption = normalizedText.match(/NO\s*->\s*(.+?)(?=\s+SI\s*->|\s+No puedo responder|\s+\d+[A-Z]?[.\-)]|\s*$)/i);
  const siOption = normalizedText.match(/SI\s*->\s*(.+?)(?=\s+No puedo responder|\s+\d+[A-Z]?[.\-)]|\s*$)/i);
  const noPuedoResponder = normalizedText.match(/No puedo responder(?:\s*\/\s*[^0-9].+?)?(?=\s+\d+[A-Z]?[.\-)]|\s*$)/i);

  const visibleQuestions = uniqueTexts(
    [
      probableQuestionText ?? "",
      noOption ? `NO -> ${noOption[1].replace(/\s+/g, " ").trim()}` : "",
      siOption ? `SI -> ${siOption[1].replace(/\s+/g, " ").trim()}` : "",
      noPuedoResponder ? noPuedoResponder[0].replace(/\s+/g, " ").trim() : ""
    ],
    10
  );

  return {
    probableQuestionText,
    visibleQuestions
  };
}

async function extractBodyTextSignals(page: Page) {
  const bodyText = await page
    .evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim())
    .catch(() => "");

  return {
    pageTextPreview: bodyText.slice(0, 3000),
    ...extractQuestionSignalsFromText(bodyText)
  };
}

async function inspectSurveyDom(page: Page): Promise<SurveyDomSnapshot> {
  const evaluateDomSnapshot = () => {
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    };

    const cleanText = (value: string | null | undefined) =>
      (value ?? "").replace(/\s+/g, " ").trim();

    const getAssociatedLabelText = (control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
      const nativeLabels = "labels" in control ? Array.from(control.labels ?? []) : [];
      const explicitLabels =
        control.id.length > 0
          ? Array.from(document.querySelectorAll("label[for]")).filter(
              (label) => (label as HTMLLabelElement).htmlFor === control.id
            )
          : [];

      const wrappingLabel = control.closest("label");
      const labelTexts = [...nativeLabels, ...explicitLabels, ...(wrappingLabel ? [wrappingLabel] : [])]
        .map((label) => cleanText(label.textContent))
        .filter(Boolean);

      return labelTexts[0] ?? "";
    };

    const visibleTextNodes = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, legend, label, p, td, th, span, div")
    )
      .filter(isVisible)
      .map((element) => cleanText(element.textContent))
      .filter((text) => text.length >= 2);

    const questionBlocks = Array.from(document.querySelectorAll("th, td, legend, p, div, span"))
      .filter(isVisible)
      .map((element) => cleanText(element.textContent))
      .filter((text) => text.length >= 2 && text.length <= 1400);

    const visibleLabels = Array.from(document.querySelectorAll("label, legend"))
      .filter(isVisible)
      .map((element) => cleanText(element.textContent))
      .filter((text) => text.length >= 2);

    const buttonTexts = Array.from(
      document.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button']")
    )
      .filter(isVisible)
      .map((element) => {
        const control = element as HTMLInputElement | HTMLButtonElement;
        return cleanText(control.textContent || control.getAttribute("value") || control.getAttribute("aria-label"));
      })
      .filter((text) => text.length >= 1);

    const visibleInputs = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter((element) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const type = "type" in control ? (control.type ?? "").toLowerCase() : "";
        return isVisible(element) && !["hidden", "submit", "button", "image"].includes(type);
      })
      .map((element) => {
        const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        return {
          tag: element.tagName.toLowerCase(),
          type: "type" in control ? control.type ?? "" : "",
          name: control.getAttribute("name") ?? "",
          id: control.id ?? "",
          placeholder: control.getAttribute("placeholder") ?? "",
          label: getAssociatedLabelText(control)
        };
      });

    const radioCount = visibleInputs.filter((input) => input.type.toLowerCase() === "radio").length;
    const textareaCount = visibleInputs.filter((input) => input.tag === "textarea").length;
    const selectCount = visibleInputs.filter((input) => input.tag === "select").length;
    const fileInputVisible = visibleInputs.some((input) => input.type.toLowerCase() === "file");
    const validatorVisible = visibleInputs.some((input) => {
      const haystack = cleanText(`${input.name} ${input.id} ${input.placeholder} ${input.label}`).toLowerCase();
      return haystack.includes("codificador") || haystack.includes("validator") || haystack.includes("folio");
    });
    const visibleOptionTexts = Array.from(document.querySelectorAll("label, legend, td, span, div, p"))
      .filter(isVisible)
      .map((element) => cleanText(element.textContent))
      .filter((text) => text.length >= 1 && text.length <= 200)
      .filter((text) => /^(si|sí|no|no puedo responder|no existe producto|no existe el producto)/i.test(text));
    const imageCount = Array.from(document.querySelectorAll("img")).filter(isVisible).length;

    const pageTextPreview = visibleTextNodes.join(" ").slice(0, 3000);

    return {
      pageTextPreview,
      visibleInputs,
      visibleLabels,
      visibleTextNodes,
      questionBlocks,
      buttonTexts,
      radioCount,
      textareaCount,
      selectCount,
      validatorVisible,
      visibleOptionTexts,
      fileInputVisible,
      imageCount
    };
  };

  const emptySnapshot = {
    pageTextPreview: "",
    visibleInputs: [] as Array<{
      tag: string;
      type: string;
      name: string;
      id: string;
      placeholder: string;
      label: string;
    }>,
    visibleLabels: [] as string[],
    visibleTextNodes: [] as string[],
    questionBlocks: [] as string[],
    buttonTexts: [] as string[],
    radioCount: 0,
    textareaCount: 0,
    selectCount: 0,
    validatorVisible: false,
    visibleOptionTexts: [] as string[],
    fileInputVisible: false,
    imageCount: 0
  };

  const mainSnapshot = await page.evaluate(evaluateDomSnapshot).catch(() => emptySnapshot);
  const childFrames = page.frames().slice(1);
  const childSnapshots = await Promise.all(
    childFrames.map(async (frame, childIndex) => {
      const snapshot = await frame.evaluate(evaluateDomSnapshot).catch(() => emptySnapshot);
      return {
        frameIndex: childIndex + 1,
        frameName: frame.name(),
        frameUrl: frame.url(),
        ...snapshot
      };
    })
  );

  const snapshots = [
    {
      frameIndex: 0,
      frameName: page.mainFrame().name(),
      frameUrl: page.url(),
      ...mainSnapshot
    },
    ...childSnapshots
  ];
  const pageFrames = page.frames();

  const pageTextPreview = snapshots
    .map((snapshot) => snapshot.pageTextPreview)
    .filter(Boolean)
    .join(" ")
    .slice(0, 3000);
  const visibleInputs = snapshots.flatMap((snapshot) => snapshot.visibleInputs);
  const visibleLabels = snapshots.flatMap((snapshot) => snapshot.visibleLabels);
  const textCandidates = snapshots.flatMap((snapshot) => snapshot.visibleTextNodes);
  const questionCandidates = snapshots.flatMap((snapshot) => snapshot.questionBlocks);
  const fullBodyText = pageTextPreview.replace(/\s+/g, " ").trim();
  const rankedQuestionCandidates = uniqueTexts(questionCandidates, 100)
    .map((text) => ({ text, score: scoreQuestionCandidate(text) }))
    .filter((candidate) => candidate.score >= 30)
    .sort((left, right) => right.score - left.score);

  const probableQuestionText =
    rankedQuestionCandidates
      .find((candidate) => /^\d+[\).\s-]/.test(candidate.text) && candidate.text.includes("?"))
      ?.text ??
    rankedQuestionCandidates
      .find((candidate) => candidate.text.includes("?"))
      ?.text ??
    fullBodyText.match(/\d+[\).\s-].{20,600}?\?/i)?.[0]?.trim() ??
    textCandidates
      .map((text) => ({ text, score: scoreQuestionCandidate(text) }))
      .filter((candidate) => candidate.score >= 30)
      .sort((left, right) => right.score - left.score)[0]?.text ?? null;

  const optionCandidates = uniqueTexts(
    questionCandidates.filter((text) => /^si\s*->|^no\s*->|^no puedo responder$/i.test(text)),
    10
  );
  const visibleQuestions = uniqueTexts(
    [
      ...rankedQuestionCandidates
        .filter((candidate) => /^\d+[\).\s-]/.test(candidate.text) || candidate.text.includes("?"))
        .map((candidate) => candidate.text),
      ...optionCandidates
    ],
    20
  );
  const questionNumber =
    probableQuestionText?.match(/^(\d+[A-Z]?)/i)?.[1] ??
    visibleQuestions.find((text) => /^\d+[A-Z]?[\).\s-]/.test(text))?.match(/^(\d+[A-Z]?)/i)?.[1] ??
    fullBodyText.match(/\b(\d+[A-Z]?)[\).\s-]+.{5,300}/i)?.[1] ??
    null;
  const normalizedPreview = normalizeText(pageTextPreview);
  const photoSelectionDetected =
    snapshots.some((snapshot) => snapshot.fileInputVisible) ||
    snapshots.some((snapshot) => snapshot.imageCount > 0 && snapshot.buttonTexts.some((text) => /subir|seleccionar|examinar/i.test(text))) ||
    PHOTO_SELECTION_KEYWORDS.some((keyword) => normalizedPreview.includes(normalizeText(keyword)));

  return {
    pageTextPreview,
    frameCount: pageFrames.length,
    frameUrls: snapshots.map((snapshot) => snapshot.frameUrl),
    frameNames: snapshots.map((snapshot) => snapshot.frameName),
    frames: snapshots.map((snapshot) => ({
      frameIndex: snapshot.frameIndex,
      frameName: snapshot.frameName,
      frameUrl: snapshot.frameUrl,
      textPreview: snapshot.pageTextPreview,
      radioCount: snapshot.radioCount,
      textareaCount: snapshot.textareaCount,
      selectCount: snapshot.selectCount,
      buttonTexts: snapshot.buttonTexts.slice(0, 20),
      visibleLabels: Array.from(new Set(snapshot.visibleLabels)).slice(0, 30)
    })),
    visibleInputs,
    visibleLabels: Array.from(new Set(visibleLabels)).slice(0, 50),
    visibleQuestions,
    probableQuestionText,
    radioCount: snapshots.reduce((sum, snapshot) => sum + snapshot.radioCount, 0),
    textareaCount: snapshots.reduce((sum, snapshot) => sum + snapshot.textareaCount, 0),
    selectCount: snapshots.reduce((sum, snapshot) => sum + snapshot.selectCount, 0),
    validatorVisible: snapshots.some((snapshot) => snapshot.validatorVisible),
    visibleOptionTexts: uniqueTexts(snapshots.flatMap((snapshot) => snapshot.visibleOptionTexts), 20),
    questionNumber,
    photoSelectionDetected,
    fileInputVisible: snapshots.some((snapshot) => snapshot.fileInputVisible),
    imageCount: snapshots.reduce((sum, snapshot) => sum + snapshot.imageCount, 0)
  };
}

function buildQuestionSignature(snapshot: SurveyDomSnapshot) {
  return [
    snapshot.questionNumber ?? "",
    snapshot.probableQuestionText ?? "",
    snapshot.visibleQuestions.join(" | "),
    snapshot.visibleOptionTexts.join(" | "),
    snapshot.pageTextPreview.slice(0, 500)
  ].join(" || ");
}

function tokenizeForSimilarity(value: string) {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  );
}

function computeTokenSimilarity(left: string, right: string) {
  const leftTokens = tokenizeForSimilarity(left);
  const rightTokens = tokenizeForSimilarity(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersection = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function buildQuestionTextsForMatch(snapshot: SurveyDomSnapshot) {
  return uniqueTexts(
    [
      snapshot.probableQuestionText ?? "",
      ...snapshot.visibleQuestions,
      snapshot.pageTextPreview.slice(0, 1500)
    ],
    10
  );
}

function matchVisibleQuestion(
  snapshot: SurveyDomSnapshot,
  questionResults: SurveyAnsweringQuestion[],
  answeredQuestionIds: Set<number>
) {
  const remainingQuestions = questionResults.filter((question) => !answeredQuestionIds.has(question.id));
  const questionTexts = buildQuestionTextsForMatch(snapshot);
  const questionNumber = normalizeText(snapshot.questionNumber ?? "");

  if (questionNumber) {
    const physicalMatch = remainingQuestions.filter(
      (question) => normalizeText(question.physicalNumber ?? "") === questionNumber
    );

    if (physicalMatch.length === 1) {
      return {
        matchedQuestion: physicalMatch[0],
        matchMethod: "physical_number",
        matchScore: 1
      };
    }
  }

  const scoredMatches = remainingQuestions
    .map((question) => {
      const referenceText = uniqueTexts([question.text ?? "", question.physicalNumber ?? ""], 5).join(" ");
      const score = Math.max(...questionTexts.map((visibleText) => computeTokenSimilarity(visibleText, referenceText)), 0);
      return {
        question,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  const top = scoredMatches[0];
  const second = scoredMatches[1];
  if (top && top.score >= 0.45 && (!second || top.score - second.score >= 0.12 || top.score >= 0.72)) {
    return {
      matchedQuestion: top.question,
      matchMethod: "text_similarity",
      matchScore: top.score
    };
  }

  const visibleHasImage = snapshot.imageCount > 0;
  const imageReferenceCandidates = remainingQuestions.filter(
    (question) => Boolean(question.referenceImageUrl?.trim()) && questionTexts.some((text) => computeTokenSimilarity(text, question.text ?? "") >= 0.2)
  );
  if (visibleHasImage && imageReferenceCandidates.length === 1) {
    return {
      matchedQuestion: imageReferenceCandidates[0],
      matchMethod: "image_reference",
      matchScore: 0.25
    };
  }

  return null;
}

async function extractVisibleRadioOptions(page: Page) {
  const options = await Promise.all(
    page.frames().map(async (frame) => {
      const radios = frame.locator("input[type='radio']");
      const total = await radios.count();
      const frameOptions: Array<{ locator: Locator; text: string }> = [];

      for (let index = 0; index < total; index += 1) {
        const locator = radios.nth(index);
        const text = await locator
          .evaluate((element) => {
            const input = element as HTMLInputElement;
            const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
            const nativeLabels = Array.from(input.labels ?? []).map((label) => clean(label.textContent)).filter(Boolean);
            const wrappingLabel = input.closest("label");
            const wrappingText = clean(wrappingLabel?.textContent);
            const siblingText = clean(
              input.parentElement?.textContent ||
                input.closest("td, th, div, span, p")?.textContent ||
                input.closest("tr")?.textContent
            );

            return nativeLabels[0] || wrappingText || siblingText || clean(input.value);
          })
          .catch(() => "");

        if (!(await isLocatorVisible(locator))) {
          continue;
        }

        frameOptions.push({
          locator,
          text
        });
      }

      return frameOptions;
    })
  );

  return options.flat().filter((option) => option.text);
}

function buildOptionEquivalents(answerText: string) {
  const normalized = normalizeText(answerText);

  if (normalized === "si" || normalized === "sí") {
    return ["SI", "Sí", "Si"];
  }

  if (normalized === "no") {
    return ["NO", "No"];
  }

  if (normalized.includes("no puedo responder") || normalized.includes("no existe")) {
    return [
      "No puedo responder",
      "No existe producto",
      "No existe el producto",
      "No puedo responder / No existe el producto",
      "No puedo responder / No existe producto"
    ];
  }

  return [answerText];
}

async function selectSurveyAnswerOption(page: Page, requestedAnswer: string) {
  const visibleOptions = await extractVisibleRadioOptions(page);

  if (visibleOptions.length === 0) {
    return {
      ok: false as const,
      visibleOptions: [],
      selectedOptionText: null
    };
  }

  const normalizedEquivalents = buildOptionEquivalents(requestedAnswer).map((item) => normalizeText(item));
  const exactMatch =
    visibleOptions.find((option) => normalizedEquivalents.includes(normalizeText(option.text))) ??
    visibleOptions.find((option) =>
      normalizedEquivalents.some((equivalent) => normalizeText(option.text).includes(equivalent))
    );

  if (!exactMatch) {
    return {
      ok: false as const,
      visibleOptions: visibleOptions.map((option) => option.text),
      selectedOptionText: null
    };
  }

  await exactMatch.locator.check({ force: true, timeout: 10_000 }).catch(async () => {
    await exactMatch.locator.click({ timeout: 10_000 });
  });

  return {
    ok: true as const,
    visibleOptions: visibleOptions.map((option) => option.text),
    selectedOptionText: exactMatch.text
  };
}

async function clickContinueFromQuestion(page: Page) {
  const continueButton = await findContinueButton(page);
  if (!continueButton) {
    throw new Error("No se encontró el botón CONTINUAR en la pregunta visible.");
  }

  await continueButton.click({ timeout: 10_000 });
  await page.waitForTimeout(1200);
}

function createEmptyTraceability(): SurveyTraceability {
  return {
    auditable: true,
    incidents: [],
    questionTraces: [],
    photoUploadScreen: { path: null, timestamp: null },
    photoSelected: { path: null, timestamp: null },
    photoConfirmationScreen: { path: null, timestamp: null },
    surveyFinalReview: { path: null, timestamp: null },
    surveySubmitted: { path: null, timestamp: null },
    surveyCompletionNumber: null,
    surveyFinished: { path: null, timestamp: null },
    selectedPhoto: null
  };
}

function getPreparedHumanSubmitSessionsStore() {
  const runtime = globalThis as typeof globalThis & {
    __preparedHumanSubmitSessions?: Map<string, PreparedHumanSubmitSession>;
  };

  if (!runtime.__preparedHumanSubmitSessions) {
    runtime.__preparedHumanSubmitSessions = new Map();
  }

  return runtime.__preparedHumanSubmitSessions;
}

function sanitizeQuestionFilePart(value: string) {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(2, "0");
  }

  const cleaned = trimmed.replace(/[^0-9a-z]+/gi, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

function createTraceabilityHelpers(
  page: Page,
  outputDir: string,
  screenshots: string[],
  actionLogs: SurveyAnsweringLog[],
  traceability: SurveyTraceability
) {
  const pushLog = (event: SurveyAnsweringLogEvent, detail?: unknown) => {
    actionLogs.push({
      timestamp: new Date().toISOString(),
      event,
      detail
    });
    console.log(event, detail ?? {});
  };

  const registerIncident = (stage: string, message: string) => {
    traceability.auditable = false;
    traceability.incidents.push({
      level: "warning",
      stage,
      message,
      timestamp: new Date().toISOString()
    });
    pushLog("WARNING_SCREENSHOT_MISSING", { stage, message });
  };

  const captureCriticalScreenshot = async (fileName: string, stage: string) => {
    try {
      const targetPath = await saveScreenshot(page, outputDir, fileName, screenshots);
      return targetPath;
    } catch (error) {
      registerIncident(stage, error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  return {
    pushLog,
    registerIncident,
    captureCriticalScreenshot
  };
}

async function findActionButton(page: Page, keywords: string[]) {
  const buttonSelectors = [
    "button",
    "input[type='submit']",
    "input[type='button']",
    "input[type='image']",
    "[role='button']"
  ];

  const candidates: Array<{
    locator: Locator;
    text: string;
    score: number;
  }> = [];

  for (const frame of page.frames()) {
    const locator = frame.locator(buttonSelectors.join(", "));
    const total = await locator.count();

    for (let index = 0; index < total; index += 1) {
      const element = locator.nth(index);
      const detected = await element
        .evaluate((node) => {
          const control = node as HTMLInputElement | HTMLButtonElement;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            text: (control.textContent || control.getAttribute("value") || control.getAttribute("aria-label") || "")
              .replace(/\s+/g, " ")
              .trim(),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0",
            disabled: "disabled" in control ? Boolean(control.disabled) : node.getAttribute("aria-disabled") === "true"
          };
        })
        .catch(() => null);

      if (!detected || !detected.visible || detected.disabled) {
        continue;
      }

      const haystack = normalizeText(detected.text);
      let score = 0;
      if (keywords.some((keyword) => haystack.includes(normalizeText(keyword)))) score += 200;
      if (detected.text) score += 20;
      candidates.push({
        locator: element,
        text: detected.text,
        score
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
}

async function selectPhotoForTraceability(
  page: Page,
  imageLinks: Array<{ index: number; href: string; text: string }>,
  preferredPhotoIndexes: number[]
) {
  const preferredImages = preferredPhotoIndexes
    .map((index) => imageLinks.find((image) => image.index === index))
    .filter((image): image is { index: number; href: string; text: string } => Boolean(image));
  const checkboxes = await Promise.all(
    page.frames().map(async (frame) => {
      const locator = frame.locator("input[type='checkbox'], [role='checkbox']");
      const total = await locator.count();
      const items: Array<{
        locator: Locator;
        text: string;
        imageSrc: string;
      }> = [];

      for (let index = 0; index < total; index += 1) {
        const checkbox = locator.nth(index);
        if (!(await isLocatorVisible(checkbox))) {
          continue;
        }

        const meta = await checkbox
          .evaluate((node) => {
            const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
            const container =
              node.closest("label, tr, td, div, li") ??
              node.parentElement ??
              node;
            const image = container.querySelector("img");
            return {
              text: clean(container.textContent),
              imageSrc: image?.getAttribute("src")?.trim() ?? ""
            };
          })
          .catch(() => ({ text: "", imageSrc: "" }));

        items.push({
          locator: checkbox,
          text: meta.text,
          imageSrc: meta.imageSrc
        });
      }

      return items;
    })
  );

  const candidates = checkboxes.flat();
  if (candidates.length === 0) {
    return null;
  }

  let best:
    | {
        locator: Locator;
        text: string;
        imageSrc: string;
        image: { index: number; href: string; text: string } | null;
      }
    | null = null;

  for (const image of preferredImages) {
    const targetHref = normalizeText(image.href);
    const byImage = candidates.find((candidate) => normalizeText(candidate.imageSrc).includes(targetHref));
    if (byImage) {
      best = { ...byImage, image };
      break;
    }

    const byText = candidates.find((candidate) => normalizeText(candidate.text).includes(normalizeText(String(image.index))));
    if (byText) {
      best = { ...byText, image };
      break;
    }
  }

  if (!best) {
    const fallbackImage = preferredImages[0] ?? imageLinks[0] ?? null;
    best = {
      ...candidates[0],
      image: fallbackImage
    };
  }

  await best.locator.check({ force: true, timeout: 10_000 }).catch(async () => {
    await best.locator.click({ timeout: 10_000 });
  });

  const selectedImage = best.image ?? imageLinks[0] ?? null;
  return selectedImage
    ? {
        imageName: selectedImage.href.split("/").at(-1) ?? `image-${selectedImage.index}`,
        imageIndex: selectedImage.index,
        sourceUrl: selectedImage.href
      }
    : null;
}

async function extractSurveyCompletionNumber(page: Page) {
  const bodyText = await page
    .evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim())
    .catch(() => "");
  const match =
    bodyText.match(/\b(?:folio|consecutivo|diligenciamiento|codigo|código|número|numero)\s*[:#]?\s*([A-Z0-9-]{4,})/i) ??
    bodyText.match(/\b([A-Z0-9]{6,})\b/);
  return match?.[1] ?? match?.[0] ?? null;
}

async function saveFrameScreenshots(
  page: Page,
  outputDir: string,
  screenshots: string[],
  hooks?: MinimalWorkerHooks,
  currentStep?: string
) {
  await saveScreenshot(page, outputDir, "08-main-page.png", screenshots, hooks, currentStep);

  const iframeLocator = page.locator("iframe");
  const iframeCount = await iframeLocator.count();

  for (let index = 0; index < iframeCount; index += 1) {
    const fileName = `${String(index + 9).padStart(2, "0")}-frame-${index}.png`;
    await iframeLocator
      .nth(index)
      .screenshot({ path: path.join(outputDir, fileName), type: "png" })
      .then(() => {
        const targetPath = path.join(outputDir, fileName);
        screenshots.push(targetPath);
        return hooks?.onScreenshotSaved?.({
          step: currentStep ?? "unknown",
          fileName,
          path: targetPath,
          timestamp: new Date().toISOString()
        });
      })
      .catch(() => undefined);
  }
}

type PollingSnapshot = {
  bodyTextLength: number;
  radioCount: number;
  labelCount: number;
  formCount: number;
  tableCount: number;
  containsSi: boolean;
  containsNo: boolean;
  containsNoPuedoResponder: boolean;
};

async function pollForClassicAspQuestion(page: Page, outputDir: string, screenshots: string[]) {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const pollingDebug: MinimalWorkerResult["pollingDebug"] = [];
  let detectedAtSecond: number | null = null;
  let finalSnapshot: PollingSnapshot = {
    bodyTextLength: 0,
    radioCount: 0,
    labelCount: 0,
    formCount: 0,
    tableCount: 0,
    containsSi: false,
    containsNo: false,
    containsNoPuedoResponder: false
  };

  for (let second = 1; second <= 30; second += 1) {
    await page.waitForTimeout(1000);
    const snapshot = await page
      .evaluate(() => {
        const bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
        const normalized = bodyText.toLowerCase();
        return {
          bodyTextLength: bodyText.length,
          radioCount: document.querySelectorAll("input[type='radio']").length,
          labelCount: document.querySelectorAll("label").length,
          formCount: document.querySelectorAll("form").length,
          tableCount: document.querySelectorAll("table").length,
          containsSi: /\bsi\b/i.test(bodyText),
          containsNo: /\bno\b/i.test(bodyText),
          containsNoPuedoResponder: normalized.includes("no puedo responder")
        };
      })
      .catch(
        () =>
          ({
            bodyTextLength: 0,
            radioCount: 0,
            labelCount: 0,
            formCount: 0,
            tableCount: 0,
            containsSi: false,
            containsNo: false,
            containsNoPuedoResponder: false
          }) satisfies PollingSnapshot
      );

    finalSnapshot = snapshot;
    pollingDebug.push({
      second,
      bodyTextLength: snapshot.bodyTextLength,
      radioCount: snapshot.radioCount,
      labelCount: snapshot.labelCount,
      formCount: snapshot.formCount,
      tableCount: snapshot.tableCount
    });

    await saveScreenshot(
      page,
      outputDir,
      `${String(second + 7).padStart(2, "0")}-wait-${second}.png`,
      screenshots
    );

    if (
      snapshot.radioCount > 0 ||
      snapshot.bodyTextLength > 500 ||
      snapshot.containsSi ||
      snapshot.containsNo ||
      snapshot.containsNoPuedoResponder
    ) {
      detectedAtSecond = second;
      break;
    }
  }

  return {
    pollingIterations: pollingDebug.length,
    firstQuestionDetectedAtSecond: detectedAtSecond,
    finalSnapshot,
    pollingDebug
  };
}

async function waitForSurveyContent(page: Page) {
  const initialSignature = await page
    .evaluate(() => `${location.href}|${document.body?.innerText.length ?? 0}|${document.body?.children.length ?? 0}`)
    .catch(() => "");

  for (const delay of [3000, 5000, 8000]) {
    await page.waitForLoadState("load").catch(() => undefined);
    await page.waitForTimeout(delay);

    const currentSignature = await page
      .evaluate(() => `${location.href}|${document.body?.innerText.length ?? 0}|${document.body?.children.length ?? 0}`)
      .catch(() => "");
    const snapshot = await inspectSurveyDom(page);

    if (
      currentSignature !== initialSignature ||
      !snapshot.validatorVisible ||
      snapshot.visibleInputs.length > 0 ||
      snapshot.radioCount > 0 ||
      snapshot.textareaCount > 0 ||
      snapshot.selectCount > 0
    ) {
      return snapshot;
    }
  }

  return inspectSurveyDom(page);
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

async function navigateUntilFirstQuestion(
  page: Page,
  context: BrowserContext,
  outputDir: string,
  screenshots: string[],
  input: MinimalWorkerInput,
  hooks?: MinimalWorkerHooks
) {
  let currentStep = "launch";
  const runtimeState: { modalMessage: string | null } = { modalMessage: null };

  page.on("dialog", async (dialog) => {
    runtimeState.modalMessage = dialog.message();
    await dialog.dismiss().catch(() => undefined);
  });

  async function setStep(step: string, message: string) {
    currentStep = step;
    await hooks?.onStepChange?.({
      step,
      message,
      timestamp: new Date().toISOString()
    });
  }

  await setStep("opening_survey", "Abriendo survey");
  await page.goto(input.surveyUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForLoadState("load");
  await saveScreenshot(page, outputDir, "01-opening-survey.png", screenshots, hooks, currentStep);

  await setStep("filling_store_code", "Ingresando Store Code");
  const storeInput = await findBestStoreInput(page);
  if (!storeInput) {
    throw new Error("No se encontró un input visible y editable para storeCode.");
  }

  const storeLocator = storeInput.frame.locator("input, textarea, select").nth(storeInput.index);
  if (!(await isLocatorVisible(storeLocator))) {
    throw new Error(`El input de storeCode dejó de ser visible: ${storeInput.selector}`);
  }

  await fillInput(storeLocator, input.storeCode);
  await saveScreenshot(page, outputDir, "02-store-code-filled.png", screenshots, hooks, currentStep);

  await setStep("submitting_store_code", "Confirmando Store Code");
  const initialUrl = page.url();
  await storeLocator.press("Enter");
  await saveScreenshot(page, outputDir, "03-store-code-submitted.png", screenshots, hooks, currentStep);

  await setStep("detecting_validator_screen", "Detectando pantalla de validator");
  const validatorScreen = await detectValidatorScreen(page, initialUrl);
  await saveScreenshot(page, outputDir, "04-validator-screen-detected.png", screenshots, hooks, currentStep);

  await setStep("filling_validator_code", "Escribiendo Validator Code");
  const validatorLocator = validatorScreen.validatorInput.frame
    .locator("input, textarea, select")
    .nth(validatorScreen.validatorInput.index);

  if (!(await isLocatorVisible(validatorLocator))) {
    throw new Error(`El input de validator dejó de ser visible: ${validatorScreen.validatorInput.selector}`);
  }

  await saveScreenshot(page, outputDir, "validator-before-fill.png", screenshots, hooks, currentStep);
  await fillInput(validatorLocator, input.validatorCode);
  await saveScreenshot(page, outputDir, "validator-after-fill.png", screenshots, hooks, currentStep);
  await saveScreenshot(page, outputDir, "05-validator-code-filled.png", screenshots, hooks, currentStep);

  await setStep("confirming_validator_code", "Validando que el Validator Code haya quedado escrito");
  const validatorValueAfterFill = await readInputValue(validatorLocator);
  if (validatorValueAfterFill !== input.validatorCode) {
    await saveScreenshot(page, outputDir, "validator-not-written.png", screenshots, hooks, currentStep);
    throw new Error("validator_code_not_written");
  }

  await setStep("detecting_image_links", "Extrayendo links de imagenes");
  const imageLinks = await extractVisibleImageLinks(page);
  await hooks?.onImageLinksDetected?.(imageLinks);
  await saveScreenshot(page, outputDir, "06-image-links-detected.png", screenshots, hooks, currentStep);

  await setStep("checking_image_links", "Abriendo imagenes detectadas");
  await verifyImageLinks(context, imageLinks);

  await setStep("reconfirming_validator_code", "Reconfirmando Validator Code antes de continuar");
  const validatorValueBeforeContinue = await readInputValue(validatorLocator);
  await saveScreenshot(page, outputDir, "validator-before-continue.png", screenshots, hooks, currentStep);
  if (validatorValueBeforeContinue !== input.validatorCode) {
    await saveScreenshot(page, outputDir, "validator-not-written.png", screenshots, hooks, currentStep);
    throw new Error("validator_code_not_written");
  }

  await setStep("clicking_continue", "Continuando hacia la primera pregunta");
  const continueButton = await findContinueButton(page);
  if (!continueButton) {
    throw new Error("No se encontró el botón para continuar después de ingresar el validator.");
  }

  await continueButton.click({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  const normalizedModalMessage =
    typeof runtimeState.modalMessage === "string" ? runtimeState.modalMessage.toLowerCase() : "";
  if (normalizedModalMessage.includes("por favor conteste la pregunta")) {
    await setStep("validator_required_modal", "Aparecio un modal indicando que falta contestar una pregunta");
    await saveScreenshot(page, outputDir, "validator-required-modal.png", screenshots, hooks, currentStep);
    throw new Error("validator_required_modal");
  }
  await saveScreenshot(page, outputDir, "07-after-continue.png", screenshots, hooks, currentStep);

  await setStep("waiting_for_survey_content", "Esperando la primera pregunta real");
  const pollingResult = await pollForClassicAspQuestion(page, outputDir, screenshots);
  const surveySnapshot = await inspectSurveyDom(page);
  await saveFrameScreenshots(page, outputDir, screenshots, hooks, currentStep);

  let pageTextPreview = surveySnapshot.pageTextPreview;
  let probableQuestionText = surveySnapshot.probableQuestionText;
  let visibleQuestions = surveySnapshot.visibleQuestions;

  if (!pageTextPreview || !probableQuestionText || visibleQuestions.length === 0) {
    const fallbackSignals = await extractBodyTextSignals(page);
    pageTextPreview = fallbackSignals.pageTextPreview || pageTextPreview;
    probableQuestionText = fallbackSignals.probableQuestionText ?? probableQuestionText;
    visibleQuestions =
      fallbackSignals.visibleQuestions.length > 0 ? fallbackSignals.visibleQuestions : visibleQuestions;
  }

  const detectedFirstQuestion =
    pollingResult.finalSnapshot.radioCount > 0 ||
    pollingResult.finalSnapshot.bodyTextLength > 500 ||
    probableQuestionText !== null ||
    visibleQuestions.some((text) => /(^|\b)(si|no)(\b|$)/i.test(text)) ||
    pageTextPreview.toLowerCase().includes("no puedo responder");

  await hooks?.onQuestionReady?.({
    probableQuestionText,
    visibleQuestions,
    radioCount: pollingResult.finalSnapshot.radioCount,
    finalBodyTextLength: pollingResult.finalSnapshot.bodyTextLength,
    firstQuestionDetectedAtSecond: pollingResult.firstQuestionDetectedAtSecond,
    pollingIterations: pollingResult.pollingIterations
  });

  await setStep(
    detectedFirstQuestion ? "first_question_detected" : "failed_after_validator_submit",
    detectedFirstQuestion ? "Primera pregunta detectada, listo para analisis visual" : "No se detecto la primera pregunta"
  );

  return {
    currentStep,
    imageLinks,
    detectedFirstQuestion,
    probableQuestionText,
    pageTextPreview,
    frameCount: surveySnapshot.frameCount,
    frameUrls: surveySnapshot.frameUrls,
    frameNames: surveySnapshot.frameNames,
    pollingIterations: pollingResult.pollingIterations,
    firstQuestionDetectedAtSecond: pollingResult.firstQuestionDetectedAtSecond,
    finalBodyTextLength: pollingResult.finalSnapshot.bodyTextLength,
    frames: surveySnapshot.frames,
    visibleInputs: surveySnapshot.visibleInputs,
    visibleLabels: surveySnapshot.visibleLabels,
    visibleQuestions,
    radioCount: pollingResult.finalSnapshot.radioCount,
    finalLabelCount: pollingResult.finalSnapshot.labelCount,
    textareaCount: surveySnapshot.textareaCount,
    selectCount: surveySnapshot.selectCount,
    pollingDebug: pollingResult.pollingDebug
  };
}

export async function runMinimalSurveyFlow(input: MinimalWorkerInput): Promise<MinimalWorkerResult> {
  return runMinimalSurveyFlowWithHooks(input);
}

export async function runMinimalSurveyFlowWithHooks(
  input: MinimalWorkerInput,
  hooks?: MinimalWorkerHooks
): Promise<MinimalWorkerResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const screenshots: string[] = [];
  const outputDir = buildOutputDir();
  let currentStep = "launch";
  let imageLinks: Array<{ index: number; href: string; text: string }> = [];
  let detectedFirstQuestion = false;
  let probableQuestionText: string | null = null;
  let pageTextPreview = "";
  let frameCount = 0;
  let frameUrls: string[] = [];
  let frameNames: string[] = [];
  let pollingIterations = 0;
  let firstQuestionDetectedAtSecond: number | null = null;
  let finalBodyTextLength = 0;
  let frames: MinimalWorkerResult["frames"] = [];
  let visibleInputs: MinimalWorkerResult["visibleInputs"] = [];
  let visibleLabels: string[] = [];
  let visibleQuestions: string[] = [];
  let radioCount = 0;
  let textareaCount = 0;
  let selectCount = 0;
  let pollingDebug: MinimalWorkerResult["pollingDebug"] = [];

  ensureDir(outputDir);

  try {
    const reachedFirstQuestion = await navigateUntilFirstQuestion(page, context, outputDir, screenshots, input, hooks);
    currentStep = reachedFirstQuestion.currentStep;
    imageLinks = reachedFirstQuestion.imageLinks;
    detectedFirstQuestion = reachedFirstQuestion.detectedFirstQuestion;
    probableQuestionText = reachedFirstQuestion.probableQuestionText;
    pageTextPreview = reachedFirstQuestion.pageTextPreview;
    frameCount = reachedFirstQuestion.frameCount;
    frameUrls = reachedFirstQuestion.frameUrls;
    frameNames = reachedFirstQuestion.frameNames;
    pollingIterations = reachedFirstQuestion.pollingIterations;
    firstQuestionDetectedAtSecond = reachedFirstQuestion.firstQuestionDetectedAtSecond;
    finalBodyTextLength = reachedFirstQuestion.finalBodyTextLength;
    frames = reachedFirstQuestion.frames;
    visibleInputs = reachedFirstQuestion.visibleInputs;
    visibleLabels = reachedFirstQuestion.visibleLabels;
    visibleQuestions = reachedFirstQuestion.visibleQuestions;
    radioCount = reachedFirstQuestion.radioCount;
    textareaCount = reachedFirstQuestion.textareaCount;
    selectCount = reachedFirstQuestion.selectCount;
    pollingDebug = reachedFirstQuestion.pollingDebug;
    const finalLabelCount = reachedFirstQuestion.finalLabelCount;

    return {
      ok: detectedFirstQuestion,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      currentStep,
      imageLinks,
      detectedFirstQuestion,
      probableQuestionText,
      pageTextPreview,
      frameCount,
      frameUrls,
      frameNames,
      pollingIterations,
      firstQuestionDetectedAtSecond,
      finalBodyTextLength,
      frames,
      visibleInputs,
      visibleLabels,
      visibleQuestions,
      radioCount,
      finalLabelCount,
      textareaCount,
      selectCount,
      pollingDebug,
      screenshots
    };
  } catch (error) {
    await saveScreenshot(page, outputDir, "99-fatal-error.png", screenshots, hooks, currentStep).catch(() => undefined);
    if (
      currentStep === "checking_image_links" ||
      currentStep === "reconfirming_validator_code" ||
      currentStep === "clicking_continue" ||
      currentStep === "detecting_first_question"
    ) {
      currentStep = "failed_after_validator_submit";
    }

    return {
      ok: false,
      finalUrl: page.url?.() ?? null,
      title: await page.title().catch(() => null),
      currentStep,
      imageLinks,
      detectedFirstQuestion,
      probableQuestionText,
      pageTextPreview,
      frameCount,
      frameUrls,
      frameNames,
      pollingIterations,
      firstQuestionDetectedAtSecond,
      finalBodyTextLength,
      frames,
      visibleInputs,
      visibleLabels,
      visibleQuestions,
      radioCount,
      finalLabelCount: visibleLabels.length,
      textareaCount,
      selectCount,
      pollingDebug,
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

export async function runSurveyAnsweringUntilPhotoSelection(
  input: SurveyAnsweringInput
): Promise<SurveyAnsweringResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const screenshots: string[] = [];
  const outputDir = buildOutputDir();
  const actionLogs: SurveyAnsweringLog[] = [];
  const answeredQuestionIds = new Set<number>();
  const traceability = createEmptyTraceability();
  const surveyCompletionNumber = null;
  let currentStep = "opening_survey";
  let baseResult: MinimalWorkerResult | null = null;

  ensureDir(outputDir);

  const pushLog = (event: SurveyAnsweringLogEvent, detail?: unknown) => {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      detail
    };
    actionLogs.push(entry);
    console.log(event, detail ?? {});
  };

  try {
    pushLog("SURVEY_ANSWERING_STARTED", {
      questionResultsCount: input.questionResults.length
    });

    const reachedFirstQuestion = await navigateUntilFirstQuestion(page, context, outputDir, screenshots, input);
    currentStep = reachedFirstQuestion.currentStep;
    baseResult = {
      ok: reachedFirstQuestion.detectedFirstQuestion,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      currentStep,
      imageLinks: reachedFirstQuestion.imageLinks,
      detectedFirstQuestion: reachedFirstQuestion.detectedFirstQuestion,
      probableQuestionText: reachedFirstQuestion.probableQuestionText,
      pageTextPreview: reachedFirstQuestion.pageTextPreview,
      frameCount: reachedFirstQuestion.frameCount,
      frameUrls: reachedFirstQuestion.frameUrls,
      frameNames: reachedFirstQuestion.frameNames,
      pollingIterations: reachedFirstQuestion.pollingIterations,
      firstQuestionDetectedAtSecond: reachedFirstQuestion.firstQuestionDetectedAtSecond,
      finalBodyTextLength: reachedFirstQuestion.finalBodyTextLength,
      finalLabelCount: reachedFirstQuestion.finalLabelCount,
      frames: reachedFirstQuestion.frames,
      visibleInputs: reachedFirstQuestion.visibleInputs,
      visibleLabels: reachedFirstQuestion.visibleLabels,
      visibleQuestions: reachedFirstQuestion.visibleQuestions,
      radioCount: reachedFirstQuestion.radioCount,
      textareaCount: reachedFirstQuestion.textareaCount,
      selectCount: reachedFirstQuestion.selectCount,
      pollingDebug: reachedFirstQuestion.pollingDebug,
      screenshots
    };

    if (!reachedFirstQuestion.detectedFirstQuestion) {
      pushLog("NEEDS_REVIEW_QUESTION_MATCH", { reason: "first_question_not_detected" });
      return {
        ...baseResult,
        ok: false,
        currentStep,
        finalState: "NEEDS_REVIEW_QUESTION_MATCH",
        actionLogs,
        answeredQuestionIds: [],
        traceability,
        surveyCompletionNumber
      };
    }

    const needsReviewBehavior = input.needsReviewBehavior ?? "stop";
    let loopGuard = 0;
    let previousSignature = "";

    while (loopGuard < input.questionResults.length + 10) {
      loopGuard += 1;
      const snapshot = await inspectSurveyDom(page);
      baseResult = {
        ...baseResult,
        finalUrl: page.url(),
        title: await page.title().catch(() => ""),
        probableQuestionText: snapshot.probableQuestionText,
        pageTextPreview: snapshot.pageTextPreview,
        frameCount: snapshot.frameCount,
        frameUrls: snapshot.frameUrls,
        frameNames: snapshot.frameNames,
        finalLabelCount: snapshot.visibleLabels.length,
        frames: snapshot.frames,
        visibleInputs: snapshot.visibleInputs,
        visibleLabels: snapshot.visibleLabels,
        visibleQuestions: snapshot.visibleQuestions,
        radioCount: snapshot.radioCount,
        textareaCount: snapshot.textareaCount,
        selectCount: snapshot.selectCount,
        screenshots
      };

      if (snapshot.photoSelectionDetected) {
        currentStep = "waiting_for_photo_selection";
        await saveScreenshot(page, outputDir, "20-photo-selection-detected.png", screenshots, undefined, currentStep);
        pushLog("PHOTO_SELECTION_SCREEN_DETECTED", {
          fileInputVisible: snapshot.fileInputVisible
        });
        pushLog("WAITING_FOR_PHOTO_SELECTION");
        return {
          ...baseResult,
          ok: true,
          currentStep,
          screenshots,
          finalState: "WAITING_FOR_PHOTO_SELECTION",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      pushLog("VISIBLE_QUESTION_EXTRACTED", {
        questionNumber: snapshot.questionNumber,
        probableQuestionText: snapshot.probableQuestionText,
        visibleQuestions: snapshot.visibleQuestions,
        visibleOptionTexts: snapshot.visibleOptionTexts
      });

      const matched = matchVisibleQuestion(snapshot, input.questionResults, answeredQuestionIds);
      if (!matched) {
        currentStep = "needs_review_question_match";
        await saveScreenshot(page, outputDir, "19-needs-review-question-match.png", screenshots, undefined, currentStep);
        pushLog("NEEDS_REVIEW_QUESTION_MATCH", {
          questionNumber: snapshot.questionNumber,
          probableQuestionText: snapshot.probableQuestionText,
          visibleQuestions: snapshot.visibleQuestions
        });
        return {
          ...baseResult,
          ok: false,
          currentStep,
          screenshots,
          finalState: "NEEDS_REVIEW_QUESTION_MATCH",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      pushLog("QUESTION_MATCHED", {
        questionId: matched.matchedQuestion.id,
        physicalNumber: matched.matchedQuestion.physicalNumber ?? "",
        matchMethod: matched.matchMethod,
        matchScore: matched.matchScore
      });

      let requestedAnswer = matched.matchedQuestion.suggestedAnswer?.trim() || "No puedo responder";
      if (matched.matchedQuestion.status === "needs_review") {
        if (needsReviewBehavior === "stop") {
          currentStep = "needs_review_question_match";
          pushLog("NEEDS_REVIEW_QUESTION_MATCH", {
            questionId: matched.matchedQuestion.id,
            reason: "answer_status_needs_review"
          });
          return {
            ...baseResult,
            ok: false,
            currentStep,
            screenshots,
            finalState: "NEEDS_REVIEW_QUESTION_MATCH",
            actionLogs,
            answeredQuestionIds: Array.from(answeredQuestionIds),
            traceability,
            surveyCompletionNumber
          };
        }

        requestedAnswer = "No puedo responder";
      }

      const optionSelection = await selectSurveyAnswerOption(page, requestedAnswer);
      if (!optionSelection.ok) {
        currentStep = "needs_review_option_match";
        await saveScreenshot(page, outputDir, "18-needs-review-option-match.png", screenshots, undefined, currentStep);
        pushLog("NEEDS_REVIEW_OPTION_MATCH", {
          questionId: matched.matchedQuestion.id,
          requestedAnswer,
          visibleOptions: optionSelection.visibleOptions
        });
        return {
          ...baseResult,
          ok: false,
          currentStep,
          screenshots,
          finalState: "NEEDS_REVIEW_OPTION_MATCH",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      answeredQuestionIds.add(matched.matchedQuestion.id);
      pushLog("ANSWER_SELECTED", {
        questionId: matched.matchedQuestion.id,
        requestedAnswer,
        selectedOptionText: optionSelection.selectedOptionText
      });

      const beforeSignature = buildQuestionSignature(snapshot);
      await clickContinueFromQuestion(page);
      currentStep = "answering_survey";
      await saveScreenshot(
        page,
        outputDir,
        `${String(20 + answeredQuestionIds.size).padStart(2, "0")}-survey-answered-${answeredQuestionIds.size}.png`,
        screenshots,
        undefined,
        currentStep
      );
      pushLog("CONTINUE_CLICKED", {
        questionId: matched.matchedQuestion.id
      });

      const afterSnapshot = await waitForSurveyContent(page);
      const afterSignature = buildQuestionSignature(afterSnapshot);
      if (afterSignature === beforeSignature && afterSignature === previousSignature) {
        currentStep = "needs_review_question_match";
        pushLog("NEEDS_REVIEW_QUESTION_MATCH", {
          questionId: matched.matchedQuestion.id,
          reason: "survey_did_not_advance"
        });
        return {
          ...baseResult,
          ok: false,
          currentStep,
          screenshots,
          finalState: "NEEDS_REVIEW_QUESTION_MATCH",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      previousSignature = beforeSignature;
    }

    currentStep = "needs_review_question_match";
    pushLog("NEEDS_REVIEW_QUESTION_MATCH", { reason: "loop_guard_exceeded" });
    return {
      ...(baseResult ?? {
        ok: false,
        finalUrl: page.url(),
        title: await page.title().catch(() => ""),
        currentStep,
        imageLinks: [],
        detectedFirstQuestion: false,
        probableQuestionText: null,
        pageTextPreview: "",
        frameCount: 0,
        frameUrls: [],
        frameNames: [],
        pollingIterations: 0,
        firstQuestionDetectedAtSecond: null,
        finalBodyTextLength: 0,
        finalLabelCount: 0,
        frames: [],
        visibleInputs: [],
        visibleLabels: [],
        visibleQuestions: [],
        radioCount: 0,
        textareaCount: 0,
        selectCount: 0,
        pollingDebug: [],
        screenshots
      }),
      ok: false,
      currentStep,
      screenshots,
      finalState: "NEEDS_REVIEW_QUESTION_MATCH",
      actionLogs,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      traceability,
      surveyCompletionNumber
    };
  } catch (error) {
    await saveScreenshot(page, outputDir, "99-fatal-error.png", screenshots, undefined, currentStep).catch(() => undefined);
    return {
      ...(baseResult ?? {
        ok: false,
        finalUrl: page.url?.() ?? null,
        title: await page.title().catch(() => null),
        currentStep,
        imageLinks: [],
        detectedFirstQuestion: false,
        probableQuestionText: null,
        pageTextPreview: "",
        frameCount: 0,
        frameUrls: [],
        frameNames: [],
        pollingIterations: 0,
        firstQuestionDetectedAtSecond: null,
        finalBodyTextLength: 0,
        finalLabelCount: 0,
        frames: [],
        visibleInputs: [],
        visibleLabels: [],
        visibleQuestions: [],
        radioCount: 0,
        textareaCount: 0,
        selectCount: 0,
        pollingDebug: [],
        screenshots
      }),
      ok: false,
      currentStep,
      screenshots,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      finalState: "NEEDS_REVIEW_QUESTION_MATCH",
      actionLogs,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      traceability,
      surveyCompletionNumber
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function runSurveyCompletionWithTraceability(
  input: SurveyAnsweringInput
): Promise<SurveyAnsweringResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const screenshots: string[] = [];
  const outputDir = buildOutputDir();
  const traceability = createEmptyTraceability();
  const actionLogs: SurveyAnsweringLog[] = [];
  const answeredQuestionIds = new Set<number>();
  let currentStep = "opening_survey";
  let baseResult: MinimalWorkerResult | null = null;
  let surveyCompletionNumber: string | null = null;
  let preparedSessionId: string | null = null;

  ensureDir(outputDir);

  const { pushLog, captureCriticalScreenshot } = createTraceabilityHelpers(
    page,
    outputDir,
    screenshots,
    actionLogs,
    traceability
  );

  try {
    pushLog("SURVEY_ANSWERING_STARTED", {
      mode: "full_traceability",
      questionResultsCount: input.questionResults.length
    });

    const reachedFirstQuestion = await navigateUntilFirstQuestion(page, context, outputDir, screenshots, input);
    currentStep = reachedFirstQuestion.currentStep;
    baseResult = {
      ok: reachedFirstQuestion.detectedFirstQuestion,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      currentStep,
      imageLinks: reachedFirstQuestion.imageLinks,
      detectedFirstQuestion: reachedFirstQuestion.detectedFirstQuestion,
      probableQuestionText: reachedFirstQuestion.probableQuestionText,
      pageTextPreview: reachedFirstQuestion.pageTextPreview,
      frameCount: reachedFirstQuestion.frameCount,
      frameUrls: reachedFirstQuestion.frameUrls,
      frameNames: reachedFirstQuestion.frameNames,
      pollingIterations: reachedFirstQuestion.pollingIterations,
      firstQuestionDetectedAtSecond: reachedFirstQuestion.firstQuestionDetectedAtSecond,
      finalBodyTextLength: reachedFirstQuestion.finalBodyTextLength,
      finalLabelCount: reachedFirstQuestion.finalLabelCount,
      frames: reachedFirstQuestion.frames,
      visibleInputs: reachedFirstQuestion.visibleInputs,
      visibleLabels: reachedFirstQuestion.visibleLabels,
      visibleQuestions: reachedFirstQuestion.visibleQuestions,
      radioCount: reachedFirstQuestion.radioCount,
      textareaCount: reachedFirstQuestion.textareaCount,
      selectCount: reachedFirstQuestion.selectCount,
      pollingDebug: reachedFirstQuestion.pollingDebug,
      screenshots
    };

    if (!reachedFirstQuestion.detectedFirstQuestion) {
      pushLog("NEEDS_REVIEW_QUESTION_MATCH", { reason: "first_question_not_detected" });
      return {
        ...baseResult,
        ok: false,
        currentStep,
        finalState: "NEEDS_REVIEW_QUESTION_MATCH",
        actionLogs,
        answeredQuestionIds: [],
        traceability,
        surveyCompletionNumber
      };
    }

    const needsReviewBehavior = input.needsReviewBehavior ?? "stop";
    let loopGuard = 0;
    let previousSignature = "";
    let photoStageReached = false;

    while (loopGuard < input.questionResults.length + 20) {
      loopGuard += 1;
      const snapshot = await inspectSurveyDom(page);
      baseResult = {
        ...baseResult,
        finalUrl: page.url(),
        title: await page.title().catch(() => ""),
        currentStep,
        probableQuestionText: snapshot.probableQuestionText,
        pageTextPreview: snapshot.pageTextPreview,
        frameCount: snapshot.frameCount,
        frameUrls: snapshot.frameUrls,
        frameNames: snapshot.frameNames,
        finalLabelCount: snapshot.visibleLabels.length,
        frames: snapshot.frames,
        visibleInputs: snapshot.visibleInputs,
        visibleLabels: snapshot.visibleLabels,
        visibleQuestions: snapshot.visibleQuestions,
        radioCount: snapshot.radioCount,
        textareaCount: snapshot.textareaCount,
        selectCount: snapshot.selectCount,
        screenshots
      };

      if (snapshot.photoSelectionDetected) {
        photoStageReached = true;
        currentStep = "photo_selection_screen";
        const screenshotPath = await captureCriticalScreenshot("photo-upload-screen.png", "photo_upload_screen");
        traceability.photoUploadScreen = {
          path: screenshotPath,
          timestamp: new Date().toISOString()
        };
        pushLog("PHOTO_SELECTION_SCREEN_DETECTED", {
          fileInputVisible: snapshot.fileInputVisible
        });
        pushLog("WAITING_FOR_PHOTO_SELECTION");
        break;
      }

      pushLog("VISIBLE_QUESTION_EXTRACTED", {
        questionNumber: snapshot.questionNumber,
        probableQuestionText: snapshot.probableQuestionText,
        visibleQuestions: snapshot.visibleQuestions,
        visibleOptionTexts: snapshot.visibleOptionTexts
      });

      const matched = matchVisibleQuestion(snapshot, input.questionResults, answeredQuestionIds);
      if (!matched) {
        currentStep = "needs_review_question_match";
        pushLog("NEEDS_REVIEW_QUESTION_MATCH", {
          questionNumber: snapshot.questionNumber,
          probableQuestionText: snapshot.probableQuestionText,
          visibleQuestions: snapshot.visibleQuestions
        });
        return {
          ...baseResult,
          ok: false,
          currentStep,
          screenshots,
          finalState: "NEEDS_REVIEW_QUESTION_MATCH",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      const questionNumber = snapshot.questionNumber || matched.matchedQuestion.physicalNumber || String(matched.matchedQuestion.id);
      const questionKey = sanitizeQuestionFilePart(questionNumber);
      const beforeScreenshotPath = await captureCriticalScreenshot(`question-${questionKey}-before.png`, `question_${questionKey}_before`);
      pushLog("QUESTION_MATCHED", {
        questionNumber,
        matchedQuestionId: matched.matchedQuestion.id,
        matchedConfidence: matched.matchScore,
        visibleQuestionText: snapshot.probableQuestionText ?? snapshot.visibleQuestions.join(" | ")
      });

      let requestedAnswer = matched.matchedQuestion.suggestedAnswer?.trim() || "No puedo responder";
      if (matched.matchedQuestion.status === "needs_review") {
        if (needsReviewBehavior === "stop") {
          currentStep = "needs_review_question_match";
          pushLog("NEEDS_REVIEW_QUESTION_MATCH", {
            questionId: matched.matchedQuestion.id,
            reason: "answer_status_needs_review"
          });
          return {
            ...baseResult,
            ok: false,
            currentStep,
            screenshots,
            finalState: "NEEDS_REVIEW_QUESTION_MATCH",
            actionLogs,
            answeredQuestionIds: Array.from(answeredQuestionIds),
            traceability,
            surveyCompletionNumber
          };
        }

        requestedAnswer = "No puedo responder";
      }

      const optionSelection = await selectSurveyAnswerOption(page, requestedAnswer);
      if (!optionSelection.ok) {
        currentStep = "needs_review_option_match";
        pushLog("NEEDS_REVIEW_OPTION_MATCH", {
          questionId: matched.matchedQuestion.id,
          requestedAnswer,
          visibleOptions: optionSelection.visibleOptions
        });
        return {
          ...baseResult,
          ok: false,
          currentStep,
          screenshots,
          finalState: "NEEDS_REVIEW_OPTION_MATCH",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      const selectedScreenshotPath = await captureCriticalScreenshot(
        `question-${questionKey}-selected.png`,
        `question_${questionKey}_selected`
      );
      answeredQuestionIds.add(matched.matchedQuestion.id);
      pushLog("ANSWER_SELECTED", {
        questionNumber,
        matchedQuestionId: matched.matchedQuestion.id,
        matchedConfidence: matched.matchScore,
        visibleQuestionText: snapshot.probableQuestionText ?? snapshot.visibleQuestions.join(" | "),
        selectedAnswer: requestedAnswer,
        selectedOptionText: optionSelection.selectedOptionText,
        timestamp: new Date().toISOString()
      });

      const beforeSignature = buildQuestionSignature(snapshot);
      await clickContinueFromQuestion(page);
      currentStep = "answering_survey";
      const afterScreenshotPath = await captureCriticalScreenshot(`question-${questionKey}-after.png`, `question_${questionKey}_after`);
      pushLog("CONTINUE_CLICKED", {
        questionId: matched.matchedQuestion.id
      });

      traceability.questionTraces.push({
        questionKey,
        questionNumber,
        matchedQuestionId: matched.matchedQuestion.id,
        matchedConfidence: matched.matchScore,
        visibleQuestionText: snapshot.probableQuestionText ?? snapshot.visibleQuestions.join(" | "),
        selectedAnswer: requestedAnswer,
        selectedOptionText: optionSelection.selectedOptionText,
        timestamp: new Date().toISOString(),
        beforeScreenshotPath,
        selectedScreenshotPath,
        afterScreenshotPath
      });

      const afterSnapshot = await waitForSurveyContent(page);
      const afterSignature = buildQuestionSignature(afterSnapshot);
      if (afterSignature === beforeSignature && afterSignature === previousSignature) {
        currentStep = "needs_review_question_match";
        pushLog("NEEDS_REVIEW_QUESTION_MATCH", {
          questionId: matched.matchedQuestion.id,
          reason: "survey_did_not_advance"
        });
        return {
          ...baseResult,
          ok: false,
          currentStep,
          screenshots,
          finalState: "NEEDS_REVIEW_QUESTION_MATCH",
          actionLogs,
          answeredQuestionIds: Array.from(answeredQuestionIds),
          traceability,
          surveyCompletionNumber
        };
      }

      previousSignature = beforeSignature;
    }

    if (!photoStageReached) {
      currentStep = "needs_review_question_match";
      pushLog("NEEDS_REVIEW_QUESTION_MATCH", { reason: "photo_stage_not_detected" });
      return {
        ...baseResult!,
        ok: false,
        currentStep,
        screenshots,
        finalState: "NEEDS_REVIEW_QUESTION_MATCH",
        actionLogs,
        answeredQuestionIds: Array.from(answeredQuestionIds),
        traceability,
        surveyCompletionNumber
      };
    }

    const preferredPhotoIndexes = Array.from(
      new Set(
        input.questionResults.flatMap((question) => question.storePhotosUsed ?? [])
      )
    );
    const selectedPhoto = await selectPhotoForTraceability(page, baseResult!.imageLinks, preferredPhotoIndexes);
    if (!selectedPhoto) {
      currentStep = "needs_review_option_match";
      pushLog("NEEDS_REVIEW_OPTION_MATCH", {
        reason: "photo_selection_not_possible"
      });
      return {
        ...baseResult!,
        ok: false,
        currentStep,
        screenshots,
        finalState: "NEEDS_REVIEW_OPTION_MATCH",
        actionLogs,
        answeredQuestionIds: Array.from(answeredQuestionIds),
        traceability,
        surveyCompletionNumber
      };
    }

    traceability.selectedPhoto = {
      ...selectedPhoto,
      timestamp: new Date().toISOString()
    };
    traceability.photoSelected = {
      path: await captureCriticalScreenshot("photo-selected.png", "photo_selected"),
      timestamp: new Date().toISOString()
    };
    pushLog("PHOTO_SELECTED", {
      imageName: selectedPhoto.imageName,
      imageIndex: selectedPhoto.imageIndex,
      sourceUrl: selectedPhoto.sourceUrl,
      timestamp: traceability.selectedPhoto.timestamp
    });
    pushLog("PHOTO_SELECTION_CONFIRMED", {
      imageIndex: selectedPhoto.imageIndex
    });

    await clickContinueFromQuestion(page);
    currentStep = "photo_confirmation_screen";
    traceability.photoConfirmationScreen = {
      path: await captureCriticalScreenshot("photo-confirmation-screen.png", "photo_confirmation_screen"),
      timestamp: new Date().toISOString()
    };
    pushLog("PHOTO_CONFIRMATION_SCREEN_DETECTED");

    const finalReviewButton = (await findActionButton(page, SUBMIT_BUTTON_KEYWORDS)) ?? (await findContinueButton(page));
    if (!finalReviewButton) {
      currentStep = "needs_review_option_match";
      pushLog("NEEDS_REVIEW_OPTION_MATCH", { reason: "final_review_button_not_found" });
      return {
        ...baseResult!,
        ok: false,
        currentStep,
        screenshots,
        finalState: "NEEDS_REVIEW_OPTION_MATCH",
        actionLogs,
        answeredQuestionIds: Array.from(answeredQuestionIds),
        traceability,
        surveyCompletionNumber
      };
    }

    currentStep = "survey_final_review";
    traceability.surveyFinalReview = {
      path: await captureCriticalScreenshot("survey-final-review.png", "survey_final_review"),
      timestamp: new Date().toISOString()
    };
    pushLog("SURVEY_FINAL_REVIEW_DETECTED", {
      buttonText: finalReviewButton.text
    });

    currentStep = "waiting_for_human_submit_confirmation";
    preparedSessionId = randomUUID();
    getPreparedHumanSubmitSessionsStore().set(preparedSessionId, {
      id: preparedSessionId,
      browser,
      context,
      page,
      outputDir,
      screenshots,
      traceability,
      actionLogs,
      answeredQuestionIds,
      baseResult: {
        ...baseResult!,
        finalUrl: page.url(),
        title: await page.title().catch(() => ""),
        currentStep,
        screenshots
      },
      createdAt: new Date().toISOString()
    });

    return {
      ...baseResult!,
      ok: true,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      currentStep,
      screenshots,
      finalState: "WAITING_FOR_HUMAN_SUBMIT_CONFIRMATION",
      actionLogs,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      traceability,
      surveyCompletionNumber,
      preparedSessionId
    };
  } catch (error) {
    await saveScreenshot(page, outputDir, "99-fatal-error.png", screenshots).catch(() => undefined);
    return {
      ...(baseResult ?? {
        ok: false,
        finalUrl: page.url?.() ?? null,
        title: await page.title().catch(() => null),
        currentStep,
        imageLinks: [],
        detectedFirstQuestion: false,
        probableQuestionText: null,
        pageTextPreview: "",
        frameCount: 0,
        frameUrls: [],
        frameNames: [],
        pollingIterations: 0,
        firstQuestionDetectedAtSecond: null,
        finalBodyTextLength: 0,
        finalLabelCount: 0,
        frames: [],
        visibleInputs: [],
        visibleLabels: [],
        visibleQuestions: [],
        radioCount: 0,
        textareaCount: 0,
        selectCount: 0,
        pollingDebug: [],
        screenshots
      }),
      ok: false,
      currentStep,
      screenshots,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      finalState: "NEEDS_REVIEW_QUESTION_MATCH",
      actionLogs,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      traceability,
      surveyCompletionNumber,
      preparedSessionId
    };
  } finally {
    if (!preparedSessionId) {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }
}

export async function submitPreparedSurveyConfirmation(sessionId: string): Promise<SurveyAnsweringResult> {
  const store = getPreparedHumanSubmitSessionsStore();
  const session = store.get(sessionId);

  if (!session) {
    throw new Error("prepared_submit_session_not_found");
  }

  const {
    browser,
    context,
    page,
    outputDir,
    screenshots,
    traceability,
    actionLogs,
    answeredQuestionIds
  } = session;
  let currentStep = "waiting_for_human_submit_confirmation";
  let surveyCompletionNumber: string | null = null;

  const { pushLog, captureCriticalScreenshot } = createTraceabilityHelpers(
    page,
    outputDir,
    screenshots,
    actionLogs,
    traceability
  );

  try {
    const submitButton = (await findActionButton(page, SUBMIT_BUTTON_KEYWORDS)) ?? (await findContinueButton(page));
    if (!submitButton) {
      throw new Error("submit_button_not_found");
    }

    await submitButton.locator.click({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    currentStep = "survey_submitted";
    traceability.surveySubmitted = {
      path: await captureCriticalScreenshot("survey-submitted.png", "survey_submitted"),
      timestamp: new Date().toISOString()
    };
    pushLog("SURVEY_SUBMITTED");

    surveyCompletionNumber = await extractSurveyCompletionNumber(page);
    if (surveyCompletionNumber) {
      const completionPath = await captureCriticalScreenshot(
        "survey-completion-number.png",
        "survey_completion_number"
      );
      traceability.surveyCompletionNumber = {
        surveyCompletionNumber,
        timestamp: new Date().toISOString(),
        screenshot: completionPath
      };
      pushLog("SURVEY_COMPLETION_NUMBER_DETECTED", {
        surveyCompletionNumber,
        timestamp: traceability.surveyCompletionNumber.timestamp,
        screenshot: "survey-completion-number.png"
      });
    }

    currentStep = "survey_finished";
    traceability.surveyFinished = {
      path: await captureCriticalScreenshot("survey-finished.png", "survey_finished"),
      timestamp: new Date().toISOString()
    };
    pushLog("SURVEY_FINISHED");

    const result: SurveyAnsweringResult = {
      ...session.baseResult,
      ok: true,
      finalUrl: page.url(),
      title: await page.title().catch(() => ""),
      currentStep,
      screenshots,
      finalState: "SURVEY_FINISHED",
      actionLogs,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      traceability,
      surveyCompletionNumber,
      preparedSessionId: null
    };

    store.delete(sessionId);
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    return result;
  } catch (error) {
    const result: SurveyAnsweringResult = {
      ...session.baseResult,
      ok: false,
      finalUrl: page.url?.() ?? session.baseResult.finalUrl,
      title: await page.title().catch(() => session.baseResult.title),
      currentStep,
      screenshots,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      finalState: "NEEDS_REVIEW_OPTION_MATCH",
      actionLogs,
      answeredQuestionIds: Array.from(answeredQuestionIds),
      traceability,
      surveyCompletionNumber,
      preparedSessionId: sessionId
    };

    store.delete(sessionId);
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    return result;
  }
}
