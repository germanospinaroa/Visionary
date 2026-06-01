import crypto from "node:crypto";
import { loadProjectConfig } from "@/lib/pilot/project-engine";
import { getMinimalWorkerBaseUrl } from "@/lib/pilot/minimal-worker-client";

export type AgentTimelineStatus = "pending" | "running" | "completed" | "failed";
export type AuditQuestionStatus = "pending" | "analyzing" | "answered" | "needs_review";
export type CanonicalStepKey =
  | "starting-store"
  | "opening-survey"
  | "entering-store-code"
  | "detecting-validator-screen"
  | "writing-validator-code"
  | "extracting-image-links"
  | "opening-images"
  | "entering-first-question"
  | "first-question-detected"
  | "ready-for-visual-analysis";

export type ProjectQuestionOption = string;
export type ProjectQuestionAnswer = string | "PENDIENTE_ANALISIS_VISUAL";

export interface ProjectQuestion {
  id: number;
  physicalNumber?: string;
  text?: string;
  referenceImageUrl?: string;
  referenceImageFile?: string;
  referenceImageDataUrl?: string;
  specificInstructions?: string;
  expectedOptions: ProjectQuestionOption[];
  active?: boolean;
  status: AuditQuestionStatus;
  suggestedAnswer?: ProjectQuestionAnswer;
  confidence?: number;
  reasoning?: string;
  storePhotosUsed?: number[];
  evidence?: string[];
  visualDiagnostic?: {
    whatTheQuestionAsks: string;
    requiredEvidence: string[];
    evidenceFound: string[];
    evidenceMissing: string[];
    visualComparisonWithReference: string;
    decisionRuleApplied: string;
  };
}

type MinimalImageLink = {
  index: number;
  href: string;
  text: string;
};

type MinimalWorkerResult = {
  ok: boolean;
  finalUrl: string | null;
  title: string | null;
  currentStep: string;
  imageLinks: MinimalImageLink[];
  detectedFirstQuestion: boolean;
  probableQuestionText: string | null;
  pageTextPreview: string;
  pollingIterations: number;
  firstQuestionDetectedAtSecond: number | null;
  finalBodyTextLength: number;
  radioCount: number;
  screenshots: string[];
  error?: string;
  stack?: string | null;
};

type ScreenshotItem = {
  id: string;
  label: string;
  stepKey: CanonicalStepKey;
  fileName: string;
  path: string;
  createdAt: string;
};

type TimelineItem = {
  key: CanonicalStepKey;
  label: string;
  status: AgentTimelineStatus;
  timestamp: string | null;
  message: string;
  error: string | null;
  screenshotPath: string | null;
};

type AuditRunState = {
  id: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  input: {
    projectId: string;
    surveyUrl: string;
    storeCode: string;
    validatorCode: string;
    projectQuestions: ProjectQuestion[];
    generalInstructions: string;
  };
  workerBaseUrl: string;
  workerEndpoint: string | null;
  workerStatusCode: number | null;
  workerErrorBody: unknown;
  currentStep: string;
  title: string | null;
  finalUrl: string | null;
  currentScreenshotPath: string | null;
  timeline: TimelineItem[];
  screenshots: ScreenshotItem[];
  imageLinks: MinimalImageLink[];
  detectedFirstQuestion: boolean;
  probableQuestionText: string | null;
  pageTextPreview: string;
  radioCount: number;
  finalBodyTextLength: number;
  pollingIterations: number;
  firstQuestionDetectedAtSecond: number | null;
  projectQuestions: ProjectQuestion[];
  error: string | null;
  stack: string | null;
};

const STEP_DEFINITIONS: Array<{ key: CanonicalStepKey; label: string }> = [
  { key: "starting-store", label: "Iniciando tienda" },
  { key: "opening-survey", label: "Abriendo survey" },
  { key: "entering-store-code", label: "Ingresando Store Code" },
  { key: "detecting-validator-screen", label: "Detectando pantalla de validator" },
  { key: "writing-validator-code", label: "Escribiendo Validator Code" },
  { key: "extracting-image-links", label: "Extrayendo links de imagenes" },
  { key: "opening-images", label: "Abriendo imagenes" },
  { key: "entering-first-question", label: "Entrando a primera pregunta" },
  { key: "first-question-detected", label: "Primera pregunta detectada" },
  { key: "ready-for-visual-analysis", label: "Listo para analisis visual" }
];

const WORKER_STEP_TO_TIMELINE: Record<string, CanonicalStepKey> = {
  opening_survey: "opening-survey",
  filling_store_code: "entering-store-code",
  submitting_store_code: "entering-store-code",
  detecting_validator_screen: "detecting-validator-screen",
  filling_validator_code: "writing-validator-code",
  confirming_validator_code: "writing-validator-code",
  reconfirming_validator_code: "writing-validator-code",
  detecting_image_links: "extracting-image-links",
  checking_image_links: "opening-images",
  clicking_continue: "entering-first-question",
  waiting_for_survey_content: "entering-first-question",
  first_question_detected: "first-question-detected",
  failed_after_validator_submit: "entering-first-question",
  validator_required_modal: "entering-first-question"
};

const SCREENSHOT_LABELS: Array<{ pattern: RegExp; label: string; stepKey: CanonicalStepKey }> = [
  { pattern: /01-opening-survey/i, label: "opening-survey", stepKey: "opening-survey" },
  { pattern: /02-store-code-filled/i, label: "store-code-filled", stepKey: "entering-store-code" },
  { pattern: /03-store-code-submitted/i, label: "store-code-submitted", stepKey: "entering-store-code" },
  { pattern: /04-validator-screen-detected/i, label: "validator-screen-detected", stepKey: "detecting-validator-screen" },
  { pattern: /05-validator-code-filled/i, label: "validator-code-filled", stepKey: "writing-validator-code" },
  { pattern: /validator-before-continue/i, label: "validator-before-continue", stepKey: "writing-validator-code" },
  { pattern: /06-image-links-detected/i, label: "image-links-detected", stepKey: "extracting-image-links" },
  { pattern: /07-after-continue/i, label: "after-continue", stepKey: "entering-first-question" },
  { pattern: /08-main-page/i, label: "first-question", stepKey: "first-question-detected" }
];

function getRuntimeStore() {
  const runtime = globalThis as typeof globalThis & {
    __newAuditRuns?: Map<string, AuditRunState>;
  };

  if (!runtime.__newAuditRuns) {
    runtime.__newAuditRuns = new Map<string, AuditRunState>();
  }

  return runtime.__newAuditRuns;
}

function now() {
  return new Date().toISOString();
}

function buildInitialTimeline(): TimelineItem[] {
  return STEP_DEFINITIONS.map((step) => ({
    key: step.key,
    label: step.label,
    status: step.key === "starting-store" ? "running" : "pending",
    timestamp: step.key === "starting-store" ? now() : null,
    message: step.key === "starting-store" ? "Corrida inicializada" : "Pendiente",
    error: null,
    screenshotPath: null
  }));
}

function normalizeProjectQuestion(input: Partial<ProjectQuestion>, index: number, fallbackText?: string): ProjectQuestion {
  const normalizedInput = input as Partial<ProjectQuestion> & { questionId?: number };
  return {
    id: typeof normalizedInput.id === "number" ? normalizedInput.id : typeof normalizedInput.questionId === "number" ? normalizedInput.questionId : index + 1,
    physicalNumber: normalizedInput.physicalNumber?.trim() || "",
    text: normalizedInput.text?.trim() || fallbackText || "",
    referenceImageUrl: normalizedInput.referenceImageUrl?.trim() || undefined,
    referenceImageFile: normalizedInput.referenceImageFile?.trim() || undefined,
    referenceImageDataUrl: normalizedInput.referenceImageDataUrl?.trim() || undefined,
    specificInstructions: normalizedInput.specificInstructions?.trim() || "",
    expectedOptions:
      Array.isArray(normalizedInput.expectedOptions) && normalizedInput.expectedOptions.length > 0
        ? (normalizedInput.expectedOptions.filter(Boolean) as ProjectQuestionOption[])
        : ["SI", "NO", "No puedo responder"],
    active: normalizedInput.active ?? true,
    status: normalizedInput.status ?? "pending",
    suggestedAnswer: normalizedInput.suggestedAnswer ?? "PENDIENTE_ANALISIS_VISUAL",
    confidence: normalizedInput.confidence ?? 0,
    reasoning: normalizedInput.reasoning ?? "El analisis visual real aun no fue ejecutado.",
    storePhotosUsed: normalizedInput.storePhotosUsed ?? [],
    evidence: normalizedInput.evidence ?? [],
    visualDiagnostic: {
      whatTheQuestionAsks: normalizedInput.visualDiagnostic?.whatTheQuestionAsks ?? "",
      requiredEvidence: normalizedInput.visualDiagnostic?.requiredEvidence ?? [],
      evidenceFound: normalizedInput.visualDiagnostic?.evidenceFound ?? [],
      evidenceMissing: normalizedInput.visualDiagnostic?.evidenceMissing ?? [],
      visualComparisonWithReference: normalizedInput.visualDiagnostic?.visualComparisonWithReference ?? "",
      decisionRuleApplied: normalizedInput.visualDiagnostic?.decisionRuleApplied ?? ""
    }
  };
}

function normalizeProjectQuestions(projectQuestions: Partial<ProjectQuestion>[]) {
  return projectQuestions.map((question, index) => normalizeProjectQuestion(question, index));
}

function resolveScreenshotMeta(fileName: string) {
  return (
    SCREENSHOT_LABELS.find((item) => item.pattern.test(fileName)) ?? {
      label: fileName.replace(/\.(png|jpg|jpeg)$/i, ""),
      stepKey: "entering-first-question" as CanonicalStepKey
    }
  );
}

function setTimelineRunning(run: AuditRunState, key: CanonicalStepKey, message: string) {
  const timestamp = now();
  const targetIndex = STEP_DEFINITIONS.findIndex((step) => step.key === key);
  run.timeline = run.timeline.map((item, index) => {
    if (index < targetIndex && item.status === "pending") {
      return {
        ...item,
        status: "completed",
        timestamp: item.timestamp ?? timestamp,
        message: item.message === "Pendiente" ? item.label : item.message
      };
    }

    if (item.key === key) {
      return {
        ...item,
        status: "running",
        timestamp,
        message
      };
    }

    return item;
  });
  run.updatedAt = timestamp;
}

function finalizeTimeline(run: AuditRunState, ok: boolean, error: string | null) {
  const timestamp = now();
  const finalKey = ok ? "ready-for-visual-analysis" : WORKER_STEP_TO_TIMELINE[run.currentStep] ?? "entering-first-question";
  const finalIndex = STEP_DEFINITIONS.findIndex((step) => step.key === finalKey);

  run.timeline = run.timeline.map((item, index) => {
    if (index < finalIndex && item.status !== "failed") {
      return {
        ...item,
        status: "completed",
        timestamp: item.timestamp ?? timestamp,
        message: item.message === "Pendiente" ? item.label : item.message
      };
    }

    if (index === finalIndex) {
      return {
        ...item,
        status: ok ? "completed" : "failed",
        timestamp: item.timestamp ?? timestamp,
        message: ok
          ? item.key === "ready-for-visual-analysis"
            ? "Listo para analisis visual"
            : item.message
          : item.message || "No fue posible completar este paso",
        error: ok ? null : error
      };
    }

    return item;
  });
}

function ingestWorkerScreenshots(run: AuditRunState, screenshotPaths: string[]) {
  run.screenshots = screenshotPaths.map((path, index) => {
    const fileName = path.split("/").at(-1) ?? path;
    const meta = resolveScreenshotMeta(fileName);
    return {
      id: crypto.randomUUID(),
      label: meta.label,
      stepKey: meta.stepKey,
      fileName,
      path,
      createdAt: new Date(Date.now() + index).toISOString()
    };
  });

  run.currentScreenshotPath = screenshotPaths.at(-1) ?? null;

  for (const screenshot of run.screenshots) {
    run.timeline = run.timeline.map((item) =>
      item.key === screenshot.stepKey
        ? {
            ...item,
            status: "completed",
            timestamp: item.timestamp ?? screenshot.createdAt,
            message: item.message === "Pendiente" ? item.label : item.message,
            screenshotPath: screenshot.path
          }
        : item
    );
  }
}

async function executeRun(runId: string) {
  const store = getRuntimeStore();
  const run = store.get(runId);

  if (!run) {
    return;
  }

  const baseUrl = run.workerBaseUrl;
  if (!baseUrl) {
    run.status = "failed";
    run.error = "minimal_worker_not_configured";
    run.workerEndpoint = null;
    run.workerStatusCode = 503;
    run.workerErrorBody = null;
    finalizeTimeline(run, false, run.error);
    store.set(run.id, { ...run });
    return;
  }

  const endpoint = `${baseUrl}/minimal-runs/start`;
  run.workerEndpoint = endpoint;
  run.currentStep = "opening_survey";
  setTimelineRunning(run, "opening-survey", "Llamando al worker real");
  store.set(run.id, { ...run });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        surveyUrl: run.input.surveyUrl,
        storeCode: run.input.storeCode,
        validatorCode: run.input.validatorCode
      }),
      cache: "no-store"
    });

    const payload = (await response.json().catch(() => null)) as MinimalWorkerResult | Record<string, unknown> | null;
    run.workerStatusCode = response.status;

    if (!response.ok || !payload || !("currentStep" in payload)) {
      run.status = "failed";
      run.error = (payload && "error" in payload && typeof payload.error === "string" ? payload.error : "minimal_worker_request_failed") ?? "minimal_worker_request_failed";
      run.workerErrorBody = payload;
      run.stack =
        payload && "stack" in payload && typeof payload.stack === "string" ? payload.stack : null;
      finalizeTimeline(run, false, run.error);
      store.set(run.id, { ...run });
      return;
    }

    const result = payload as MinimalWorkerResult;
    run.status = result.ok ? "completed" : "failed";
    run.updatedAt = now();
    run.title = result.title;
    run.finalUrl = result.finalUrl;
    run.currentStep = result.currentStep;
    run.imageLinks = result.imageLinks;
    run.detectedFirstQuestion = result.detectedFirstQuestion;
    run.probableQuestionText = result.probableQuestionText;
    run.pageTextPreview = result.pageTextPreview;
    run.radioCount = result.radioCount;
    run.finalBodyTextLength = result.finalBodyTextLength;
    run.pollingIterations = result.pollingIterations;
    run.firstQuestionDetectedAtSecond = result.firstQuestionDetectedAtSecond;
    run.error = result.error ?? null;
    run.stack = result.stack ?? null;
    run.workerErrorBody = result.ok ? null : result;

    ingestWorkerScreenshots(run, result.screenshots ?? []);

    // Fill the structured timeline from the worker final state and known screenshot steps.
    setTimelineRunning(run, "opening-survey", "Survey abierto");
    if (run.screenshots.some((item) => item.stepKey === "entering-store-code")) {
      setTimelineRunning(run, "entering-store-code", "Store Code cargado");
    }
    if (run.screenshots.some((item) => item.stepKey === "detecting-validator-screen")) {
      setTimelineRunning(run, "detecting-validator-screen", "Pantalla de validator detectada");
    }
    if (run.screenshots.some((item) => item.stepKey === "writing-validator-code")) {
      setTimelineRunning(run, "writing-validator-code", "Validator Code cargado");
    }
    if (run.screenshots.some((item) => item.stepKey === "extracting-image-links")) {
      setTimelineRunning(run, "extracting-image-links", "Links de imagenes detectados");
    }
    if (run.imageLinks.length > 0) {
      setTimelineRunning(run, "opening-images", "Fotos reales detectadas");
    }
    if (result.detectedFirstQuestion) {
      setTimelineRunning(run, "first-question-detected", "Primera pregunta detectada");
    }

    finalizeTimeline(run, result.ok, result.error ?? null);
    store.set(run.id, { ...run });
  } catch (error) {
    run.status = "failed";
    run.updatedAt = now();
    run.error = error instanceof Error ? error.message : String(error);
    run.stack = error instanceof Error ? error.stack ?? null : null;
    run.workerStatusCode = 500;
    run.workerErrorBody = null;
    finalizeTimeline(run, false, run.error);
    store.set(run.id, { ...run });
  }
}

export function createAuditRun(input: {
  projectId: string;
  surveyUrl: string;
  storeCode: string;
  validatorCode: string;
  projectQuestions: Partial<ProjectQuestion>[];
  generalInstructions: string;
}) {
  const projectConfig = loadProjectConfig(input.projectId);
  const mergedInstructions = [projectConfig.globalInstructions, ...projectConfig.rules, input.generalInstructions]
    .filter(Boolean)
    .join("\n");
  const normalizedQuestions = normalizeProjectQuestions(input.projectQuestions);
  const run: AuditRunState = {
    id: crypto.randomUUID(),
    status: "running",
    createdAt: now(),
    updatedAt: now(),
    input: {
      ...input,
      surveyUrl: input.surveyUrl || projectConfig.surveyUrl,
      generalInstructions: mergedInstructions,
      projectQuestions: normalizedQuestions
    },
    workerBaseUrl: getMinimalWorkerBaseUrl(),
    workerEndpoint: null,
    workerStatusCode: null,
    workerErrorBody: null,
    currentStep: "starting_store",
    title: null,
    finalUrl: null,
    currentScreenshotPath: null,
    timeline: buildInitialTimeline(),
    screenshots: [],
    imageLinks: [],
    detectedFirstQuestion: false,
    probableQuestionText: null,
    pageTextPreview: "",
    radioCount: 0,
    finalBodyTextLength: 0,
    pollingIterations: 0,
    firstQuestionDetectedAtSecond: null,
    projectQuestions: normalizedQuestions,
    error: null,
    stack: null
  };

  getRuntimeStore().set(run.id, run);
  void executeRun(run.id);
  return run.id;
}

export function getAuditRun(runId: string) {
  return getRuntimeStore().get(runId) ?? null;
}
