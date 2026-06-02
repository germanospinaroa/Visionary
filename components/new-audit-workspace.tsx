"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectQuestion } from "@/lib/new-audit-runtime";
import type {
  VisualQuestionResult,
  VisualQuestionUnderstanding,
  VisualStoreAnalysisResponse
} from "@/lib/new-audit-visual-analysis";
import {
  VisualPipelineV2Error,
  type VisualPipelineV2BatchState as VisualPipelineV2BatchStateResult,
  type VisualPipelineV2QuestionInput,
  runVisualAuditV2
} from "@/lib/visual-pipeline-v2";

type WorkspaceStatus = "Draft" | "Running" | "Ready" | "Failed";
type PhotoLoadState = "pending" | "loaded" | "error";
type TimelineStatus = "pending" | "running" | "completed" | "failed";

type ImageLink = {
  index: number;
  href: string;
  text: string;
};

type TimelineItem = {
  key: string;
  label: string;
  status: TimelineStatus;
  timestamp: string | null;
  message: string;
  error: string | null;
  screenshotPath: string | null;
  screenshotUrl: string | null;
  questionNumber?: string | null;
  selectedAnswer?: string | null;
  selectorUsed?: string | null;
};

type ScreenshotItem = {
  id: string;
  label: string;
  stepKey: string;
  fileName: string;
  path: string;
  createdAt: string;
  url: string | null;
};

type TraceabilityQuestionEntry = {
  questionKey: string;
  questionNumber: string;
  matchedQuestionId: number;
  matchedConfidence: number;
  visibleQuestionText: string;
  selectedAnswer: string;
  selectedOptionText: string | null;
  timestamp: string;
  status?: "completed" | "failed";
  selectorUsed?: string | null;
  error?: string | null;
  beforeScreenshotPath: string | null;
  beforeScreenshotUrl?: string | null;
  selectedScreenshotPath: string | null;
  selectedScreenshotUrl?: string | null;
  afterScreenshotPath: string | null;
  afterScreenshotUrl?: string | null;
};

type TraceabilityStageView = {
  path: string | null;
  timestamp: string | null;
  url?: string | null;
};

type TraceabilityView = {
  auditable: boolean;
  incidents: Array<{
    level: "warning";
    stage: string;
    message: string;
    timestamp: string;
  }>;
  questionTraces: TraceabilityQuestionEntry[];
  photoUploadScreen: TraceabilityStageView | null;
  photoSelected: TraceabilityStageView | null;
  photoConfirmationScreen: TraceabilityStageView | null;
  surveyFinalReview: TraceabilityStageView | null;
  surveySubmitted: TraceabilityStageView | null;
  surveyCompletionNumber:
    | {
        surveyCompletionNumber: string;
        timestamp: string;
        screenshot: string | null;
        url?: string | null;
      }
    | null;
  surveyFinished: TraceabilityStageView | null;
  selectedPhoto:
    | {
        imageName: string;
        imageIndex: number;
        sourceUrl: string;
        selectorUsed?: string | null;
        timestamp: string;
      }
    | null;
};

type QuestionEvidenceReference = {
  kind: "before" | "selected" | "after" | "screen";
  label: string;
  screenshotPath: string;
  screenshotUrl: string | null;
  captureId: string;
};

type QuestionMatchDebugView = {
  screenshotPath: string | null;
  screenshotUrl?: string | null;
  visibleQuestionText: string;
  visibleQuestions: string[];
  visibleOptions: string[];
  bodyInnerText: string;
  htmlPreview: string;
  selectorUsed: string;
  reason: string;
};

type CurrentQuestionOptionView = {
  label: string;
  value: string;
  checked: boolean;
  selector: string;
};

type CurrentQuestionView = {
  questionNumber: number | null;
  probableQuestionText: string | null;
  visibleQuestions: string[];
  visibleOptionTexts: string[];
  radioCount: number;
  selectedRadioBefore: string | null;
  options: CurrentQuestionOptionView[];
  bodyTextPreview: string;
  formCount: number;
  tableCount: number;
  error?: "DOM_EXTRACTION_FAILED";
};

type AuditRun = {
  id: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  currentStep: string;
  title: string | null;
  finalUrl: string | null;
  detectedFirstQuestion: boolean;
  probableQuestionText: string | null;
  pageTextPreview: string;
  radioCount: number;
  finalBodyTextLength: number;
  pollingIterations: number;
  firstQuestionDetectedAtSecond: number | null;
  currentScreenshotUrl: string | null;
  timeline: TimelineItem[];
  screenshots: ScreenshotItem[];
  imageLinks: ImageLink[];
  projectQuestions: ProjectQuestion[];
  generalInstructions: string;
  storeCode: string;
  surveyUrl: string;
  validatorCode: string;
  workerEndpoint?: string | null;
  workerStatusCode?: number | null;
  workerErrorBody?: unknown;
  error: string | null;
  stack: string | null;
  traceability?: TraceabilityView | null;
  surveyCompletionNumber?: string | null;
  finalState?: string | null;
  preparedSessionId?: string | null;
  stepperSessionId?: string | null;
  currentQuestion?: CurrentQuestionView | null;
  questionMatchDebug?: QuestionMatchDebugView | null;
  actionLogs?: Array<{
    timestamp: string;
    event: string;
    detail?: unknown;
  }>;
  answeredQuestionIds?: number[];
};

type DirectPreviewPayload = {
  ok?: boolean;
  error?: string;
  stack?: string | null;
  currentStep?: string;
  finalUrl?: string | null;
  title?: string | null;
  imageLinks?: ImageLink[];
  screenshots?: string[];
  screenshotPaths?: string[];
  screenshotUrls?: string[];
  currentScreenshotUrl?: string | null;
  detectedFirstQuestion?: boolean;
  probableQuestionText?: string | null;
  pageTextPreview?: string;
  radioCount?: number;
  pollingIterations?: number;
  firstQuestionDetectedAtSecond?: number | null;
  finalBodyTextLength?: number;
  finalState?: string;
  actionLogs?: Array<{
    timestamp: string;
    event: string;
    detail?: unknown;
  }>;
  answeredQuestionIds?: number[];
  traceability?: TraceabilityView;
  questionMatchDebug?: QuestionMatchDebugView | null;
  surveyCompletionNumber?: string | null;
  preparedSessionId?: string | null;
  stepperSessionId?: string | null;
  currentQuestion?: CurrentQuestionView | null;
};

type ReferenceImageSession = {
  file: File;
  previewUrl: string;
};

type PerPhotoAnalysis = {
  photoIndex: number;
  productsDetected: string[];
  brandsDetected: string[];
  sectionsDetected: string[];
  observations: string[];
  confidence: number;
};

type KnowledgeBase = {
  summary: string;
  brandsDetected: string[];
  productsDetected: string[];
  productsAbsent: string[];
  categoriesDetected: string[];
  sectionsDetected: string[];
  orderingDetected: string[];
  shelfLocations: string[];
  signageDetected: string[];
  visiblePrices: string[];
  promotionsDetected: string[];
  facingDisplaySignals: string[];
  relevantVisualSignals: string[];
  uncertainties: string[];
  crossQuestionInsights?: string[];
};

type ErrorDetails = {
  message: string;
  endpoint?: string | null;
  status?: number | null;
  body?: unknown;
  stack?: string | null;
  batch?: number | null;
  questionIds?: number[];
  expectedQuestionIds?: number[];
  receivedQuestionIds?: number[];
  missingQuestionIds?: number[];
  openAiApiKeyConfigured?: boolean | null;
  storePhotosReceived?: number | null;
  projectQuestionsReceived?: number | null;
  referenceImagesReceived?: number | null;
};

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type VisualAnalysisLog = {
  timestamp: string;
  message: string;
  detail?: unknown;
};

type VisualRequestMeta = {
  payloadSizeBytes: number;
  photoCount: number;
  questionCount: number;
  rawText: string | null;
  status: number | null;
};

type SerializedVisualQuestion = {
  id: number;
  physicalNumber?: string;
  active: boolean;
  text?: string;
  referenceImageUrl?: string;
  referenceImageDataUrl?: string;
  specificInstructions?: string;
  expectedOptions: string[];
};

type VisualBatchStatus = "pending" | "running" | "completed" | "failed" | "partial_failed";

type VisualBatchState = {
  batchNumber: number;
  totalBatches: number;
  questionIds: number[];
  status: VisualBatchStatus;
  error: ErrorDetails | null;
};

type VisualPipelineStageState = "pending" | "running" | "completed" | "failed";

type VisualPipelineState = {
  phaseAQuestionBank: VisualPipelineStageState;
  phaseBStoreAnalysis: VisualPipelineStageState;
  phaseCAnswers: VisualPipelineStageState;
  batchStates: VisualBatchState[];
  answeredCount: number;
  needsReviewCount: number;
  pendingCount: number;
  photosUsedCount: number;
  batchFailures: Array<{
    batch: number;
    questionIds: number[];
    message: string;
  }>;
};

type QuestionBankCacheEntry = {
  questionUnderstanding: VisualQuestionUnderstanding[];
  updatedAt: string;
};

type QuestionBankCacheStore = Record<string, QuestionBankCacheEntry>;

const DEFAULT_SURVEY_URL = "https://smrweb.ar/online/is/is378/shave1.html";
const MAX_VISUAL_PAYLOAD_BYTES = 1_500_000;
const MAX_REFERENCE_IMAGE_BYTES = 350_000;
const REFERENCE_IMAGE_MAX_DIMENSION = 1400;
const REFERENCE_IMAGE_JPEG_QUALITY = 0.72;
const QUESTION_BANK_CACHE_KEY = "new-audit-question-bank-analysis-v2";
const QUESTION_BANK_BATCH_SIZE = 2;
const QUESTION_BANK_BATCH_RETRIES = 1;
const DEFAULT_GENERAL_INSTRUCTIONS = [
  "Criterios visuales:",
  "- Analizar las fotos reales de tienda una sola vez.",
  "- No responder sin evidencia visible suficiente.",
  "",
  "Reglas del cliente:",
  "- Usar SI, NO o No puedo responder.",
  "- Indicar confianza y evidencia cuando exista.",
  "- Si la evidencia no alcanza, mantener PENDIENTE_ANALISIS_VISUAL."
].join("\n");

function buildEmptyVisualDiagnostic() {
  return {
    whatTheQuestionAsks: "",
    requiredEvidence: [] as string[],
    evidenceFound: [] as string[],
    evidenceMissing: [] as string[],
    visualComparisonWithReference: "",
    decisionRuleApplied: ""
  };
}

function buildEmptyKnowledgeBase(): KnowledgeBase {
  return {
    summary: "",
    brandsDetected: [],
    productsDetected: [],
    productsAbsent: [],
    categoriesDetected: [],
    sectionsDetected: [],
    orderingDetected: [],
    shelfLocations: [],
    signageDetected: [],
    visiblePrices: [],
    promotionsDetected: [],
    facingDisplaySignals: [],
    relevantVisualSignals: [],
    uncertainties: [],
    crossQuestionInsights: []
  };
}

function resetQuestionVisualResult(question: ProjectQuestion): ProjectQuestion {
  return {
    ...question,
    status: "pending",
    suggestedAnswer: "PENDIENTE_ANALISIS_VISUAL",
    confidence: 0,
    reasoning: "El analisis visual real aun no fue ejecutado.",
    storePhotosUsed: [],
    evidence: [],
    visualDiagnostic: buildEmptyVisualDiagnostic()
  };
}

function buildEmptyQuestion(id: number): ProjectQuestion {
  return {
    id,
    physicalNumber: "",
    text: "",
    referenceImageUrl: "",
    referenceImageFile: "",
    specificInstructions: "",
    expectedOptions: ["SI", "NO", "No puedo responder"],
    active: true,
    status: "pending",
    suggestedAnswer: "PENDIENTE_ANALISIS_VISUAL",
    confidence: 0,
    reasoning: "El analisis visual real aun no fue ejecutado.",
    storePhotosUsed: [],
    evidence: [],
    visualDiagnostic: buildEmptyVisualDiagnostic()
  };
}

function buildQuestionTemplate() {
  return Array.from({ length: 14 }, (_, index) => buildEmptyQuestion(index + 1));
}

function downloadCsv(fileName: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function truncateText(value: string | null | undefined, max = 120) {
  if (!value) {
    return "Sin datos reales todavia";
  }

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}...`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Sin hora";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function groupScreenshotsByStep(screenshots: ScreenshotItem[]) {
  return screenshots.reduce<Record<string, ScreenshotItem[]>>((groups, screenshot) => {
    if (!groups[screenshot.stepKey]) {
      groups[screenshot.stepKey] = [];
    }

    groups[screenshot.stepKey].push(screenshot);
    return groups;
  }, {});
}

function buildCaptureId(path: string) {
  return `capture-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function deriveScreenshotStepKey(path: string) {
  const fileName = path.split("/").at(-1) ?? path;

  if (/^question-[^-]+-(before|selected|after)\.png$/i.test(fileName) || /^q[^-]+-(before-answer|answer-selected|after-continue|error)\.png$/i.test(fileName)) {
    return fileName.replace(/\.png$/i, "");
  }

  if (/^\d+-survey-answered-\d+\.png$/i.test(fileName)) {
    return fileName.replace(/\.png$/i, "");
  }

  if (/photo|survey|validator|frame|wait|final|evidence/i.test(fileName)) {
    return fileName.replace(/\.png$/i, "");
  }

  return "misc";
}

function firstActionLogTimestamp(
  actionLogs: AuditRun["actionLogs"] | undefined,
  event: string,
  predicate?: (detail: unknown) => boolean
) {
  return (
    actionLogs?.find((entry) => entry.event === event && (predicate ? predicate(entry.detail) : true))?.timestamp ?? null
  );
}

function buildExecutionTimeline(activeRun: AuditRun | null): TimelineItem[] {
  if (!activeRun) {
    return [];
  }

  const traceability = activeRun.traceability;
  const screenshots = new Map((activeRun.screenshots ?? []).map((item) => [item.path, item.url ?? null]));
  const items: TimelineItem[] = [];
  const withScreenshot = (path: string | null | undefined) => ({
    screenshotPath: path ?? null,
    screenshotUrl: path ? screenshots.get(path) ?? null : null
  });

  if (activeRun.actionLogs?.length) {
    items.push({
      key: "visual-analysis-completed",
      label: "Analisis visual completado",
      status: "completed",
      timestamp: activeRun.actionLogs[0]?.timestamp ?? activeRun.updatedAt,
      message: "El worker comenzo la fase de ejecucion con trazabilidad total.",
      error: null,
      screenshotPath: null,
      screenshotUrl: null
    });
  }

  traceability?.questionTraces?.forEach((entry) => {
    const questionStatus = entry.status === "failed" ? "failed" : "completed";
    items.push({
      key: `question-${entry.matchedQuestionId}-detected`,
      label: `Pregunta ${entry.questionNumber} detectada`,
      status: "completed",
      timestamp:
        firstActionLogTimestamp(
          activeRun.actionLogs,
          "QUESTION_MATCHED",
          (detail) => (detail as { questionNumber?: string } | undefined)?.questionNumber === entry.questionNumber
        ) ?? entry.timestamp,
      message: entry.visibleQuestionText,
      error: null,
      questionNumber: entry.questionNumber,
      selectedAnswer: entry.selectedAnswer,
      selectorUsed: entry.selectorUsed ?? null,
      ...withScreenshot(entry.beforeScreenshotPath)
    });
    items.push({
      key: `question-${entry.matchedQuestionId}-selected`,
      label: `Pregunta ${entry.questionNumber} opcion seleccionada`,
      status: questionStatus,
      timestamp:
        firstActionLogTimestamp(
          activeRun.actionLogs,
          "ANSWER_SELECTED",
          (detail) => (detail as { questionNumber?: string } | undefined)?.questionNumber === entry.questionNumber
        ) ?? entry.timestamp,
      message: `Respuesta calculada: ${entry.selectedAnswer}${entry.selectedOptionText ? ` | Opcion: ${entry.selectedOptionText}` : ""}`,
      error: entry.error ?? null,
      questionNumber: entry.questionNumber,
      selectedAnswer: entry.selectedAnswer,
      selectorUsed: entry.selectorUsed ?? null,
      ...withScreenshot(entry.selectedScreenshotPath)
    });
    items.push({
      key: `question-${entry.matchedQuestionId}-continued`,
      label: `Pregunta ${entry.questionNumber} continuada`,
      status: entry.afterScreenshotPath ? questionStatus : entry.status === "failed" ? "failed" : "pending",
      timestamp:
        firstActionLogTimestamp(
          activeRun.actionLogs,
          "CONTINUE_CLICKED",
          (detail) => (detail as { questionNumber?: string } | undefined)?.questionNumber === entry.questionNumber
        ) ?? entry.timestamp,
      message: entry.afterScreenshotPath ? "La encuesta avanzo despues de continuar." : "Pendiente de continuar.",
      error: entry.error ?? null,
      questionNumber: entry.questionNumber,
      selectedAnswer: entry.selectedAnswer,
      selectorUsed: entry.selectorUsed ?? null,
      ...withScreenshot(entry.afterScreenshotPath)
    });
  });

  if (traceability?.photoUploadScreen?.path) {
    items.push({
      key: "evidence-photos-screen",
      label: "Pantalla de fotos usadas detectada",
      status: "completed",
      timestamp: traceability.photoUploadScreen.timestamp,
      message: "Se detecto la pantalla de evidencia/fotos usadas.",
      error: null,
      ...withScreenshot(traceability.photoUploadScreen.path)
    });
  }

  if (traceability?.photoSelected?.path) {
    items.push({
      key: "evidence-photos-selected",
      label: "Fotos usadas seleccionadas",
      status: "completed",
      timestamp: traceability.photoSelected.timestamp,
      message: traceability.selectedPhoto
        ? `Foto ${traceability.selectedPhoto.imageIndex} seleccionada para evidencia.`
        : "Foto seleccionada.",
      error: null,
      selectorUsed: traceability.selectedPhoto?.selectorUsed ?? null,
      ...withScreenshot(traceability.photoSelected.path)
    });
  }

  if (traceability?.surveyFinalReview?.path) {
    items.push({
      key: "final-send-screen",
      label: "Pantalla final detectada",
      status: "completed",
      timestamp: traceability.surveyFinalReview.timestamp,
      message: "La encuesta quedo lista para enviar.",
      error: null,
      ...withScreenshot(traceability.surveyFinalReview.path)
    });
    items.push({
      key: "ready-to-submit",
      label: "Encuesta lista para enviar",
      status: activeRun.preparedSessionId ? "completed" : "pending",
      timestamp: traceability.surveyFinalReview.timestamp,
      message: activeRun.preparedSessionId ? "Boton final habilitado." : "Pendiente de preparar confirmacion humana.",
      error: null,
      ...withScreenshot(traceability.surveyFinalReview.path)
    });
  }

  if (traceability?.surveySubmitted?.path) {
    items.push({
      key: "survey-submitted",
      label: "Encuesta enviada",
      status: "completed",
      timestamp: traceability.surveySubmitted.timestamp,
      message: "Se hizo click final en enviar.",
      error: null,
      ...withScreenshot(traceability.surveySubmitted.path)
    });
  }

  if (traceability?.surveyCompletionNumber?.screenshot) {
    items.push({
      key: "survey-completion-number",
      label: "Numero de cuestionario capturado",
      status: "completed",
      timestamp: traceability.surveyCompletionNumber.timestamp,
      message: traceability.surveyCompletionNumber.surveyCompletionNumber,
      error: null,
      ...withScreenshot(traceability.surveyCompletionNumber.screenshot)
    });
  }

  if (traceability?.incidents?.length) {
    traceability.incidents.forEach((incident, index) => {
      items.push({
        key: `incident-${index}`,
        label: `Warning ${index + 1}`,
        status: "failed",
        timestamp: incident.timestamp,
        message: incident.stage,
        error: incident.message,
        screenshotPath: null,
        screenshotUrl: null
      });
    });
  }

  return items;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("No se pudo leer la imagen de referencia."));
    reader.readAsDataURL(file);
  });
}

function estimateUtf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo procesar la imagen de referencia."));
    image.src = url;
  });
}

type CompressReferenceImageOptions = {
  maxDimension?: number;
  quality?: number;
  maxBytes?: number;
};

async function compressReferenceImage(file: File, options: CompressReferenceImageOptions = {}) {
  if (!file.type.startsWith("image/")) {
    throw new Error("La referencia cargada no es una imagen válida.");
  }

  const maxDimension = options.maxDimension ?? REFERENCE_IMAGE_MAX_DIMENSION;
  const quality = options.quality ?? REFERENCE_IMAGE_JPEG_QUALITY;
  const maxBytes = options.maxBytes ?? MAX_REFERENCE_IMAGE_BYTES;
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(sourceUrl);
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No se pudo preparar el canvas para comprimir la imagen.");
    }

    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const payloadBytes = estimateUtf8Bytes(dataUrl);

    if (payloadBytes > maxBytes) {
      throw new Error("REFERENCE_IMAGE_TOO_LARGE");
    }

    return {
      dataUrl,
      payloadBytes,
      width,
      height
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function compressReferenceImageToLimit(file: File) {
  const attempts: CompressReferenceImageOptions[] = [
    { maxDimension: 1400, quality: 0.72, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 1200, quality: 0.65, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 1000, quality: 0.6, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 900, quality: 0.55, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 800, quality: 0.5, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 700, quality: 0.45, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 600, quality: 0.4, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 500, quality: 0.35, maxBytes: Number.POSITIVE_INFINITY },
    { maxDimension: 400, quality: 0.3, maxBytes: Number.POSITIVE_INFINITY }
  ];

  let lastCompressed: Awaited<ReturnType<typeof compressReferenceImage>> | null = null;
  for (const attempt of attempts) {
    const compressed = await compressReferenceImage(file, attempt);
    lastCompressed = compressed;
    if (compressed.payloadBytes <= MAX_REFERENCE_IMAGE_BYTES) {
      return compressed;
    }
  }

  throw new Error("REFERENCE_IMAGE_TOO_LARGE");
}

async function downloadRemoteReferenceImage(url: string) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar la referencia remota (${response.status}).`);
  }

  const blob = await response.blob();
  const contentType = blob.type || response.headers.get("content-type") || "image/jpeg";
  const fileName = (() => {
    try {
      const parsed = new URL(url);
      const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || "reference-image";
      return lastSegment.includes(".") ? lastSegment : `${lastSegment}.jpg`;
    } catch {
      return "reference-image.jpg";
    }
  })();

  return {
    file: new File([blob], fileName, { type: contentType }),
    originalSizeBytes: blob.size,
    contentType,
    downloadMs: Date.now() - startedAt
  };
}

async function normalizeVisualReferencesForAnalysis(
  questions: ProjectQuestion[],
  referenceImageSessions: Record<number, ReferenceImageSession>,
  log: (message: string, detail?: unknown) => void
) {
  const referenceCache = new Map<string, string>();
  const uniqueRemoteReferenceUrls = Array.from(
    new Set(
      questions
        .map((question) => question.referenceImageUrl?.trim() ?? "")
        .filter((value) => Boolean(value) && !value.startsWith("data:"))
    )
  );
  const downloadedRemoteReferences = new Set<string>();
  let reusedRemoteReferenceCount = 0;
  const startedAt = Date.now();

  log("REFERENCE_NORMALIZATION_STARTED", {
    questionCount: questions.length,
    activeQuestionCount: questions.filter((question) => question.active !== false).length,
    uniqueRemoteReferenceCount: uniqueRemoteReferenceUrls.length
  });

  const normalizedQuestions: SerializedVisualQuestion[] = [];
  let totalOriginalSizeBytes = 0;
  let totalCompressedSizeBytes = 0;

  for (const question of questions) {
    const sessionImage = referenceImageSessions[question.id];
    const directDataUrl = question.referenceImageDataUrl?.trim() ?? "";
    const referenceUrl = question.referenceImageUrl?.trim() ?? "";

    if (sessionImage) {
      const compressionStartedAt = Date.now();
      const compressed = await compressReferenceImageToLimit(sessionImage.file);
      totalCompressedSizeBytes += compressed.payloadBytes;
      log("REFERENCE_LOCAL_COMPRESSED", {
        questionId: question.id,
        referenceUrl: sessionImage.previewUrl,
        originalSizeBytes: sessionImage.file.size,
        compressedSizeBytes: compressed.payloadBytes,
        width: compressed.width,
        height: compressed.height,
        compressionMs: Date.now() - compressionStartedAt,
        source: "local-file"
      });
      normalizedQuestions.push({
        id: question.id,
        physicalNumber: question.physicalNumber,
        active: question.active ?? true,
        text: question.text || undefined,
        referenceImageUrl: undefined,
        referenceImageDataUrl: compressed.dataUrl,
        specificInstructions: question.specificInstructions || undefined,
        expectedOptions: question.expectedOptions
      });
      continue;
    }

    if (directDataUrl) {
      if (referenceUrl && !referenceUrl.startsWith("data:")) {
        referenceCache.set(referenceUrl, directDataUrl);
      }
      normalizedQuestions.push({
        id: question.id,
        physicalNumber: question.physicalNumber,
        active: question.active ?? true,
        text: question.text || undefined,
        referenceImageUrl: undefined,
        referenceImageDataUrl: directDataUrl,
        specificInstructions: question.specificInstructions || undefined,
        expectedOptions: question.expectedOptions
      });
      continue;
    }

    if (!referenceUrl) {
      normalizedQuestions.push({
        id: question.id,
        physicalNumber: question.physicalNumber,
        active: question.active ?? true,
        text: question.text || undefined,
        referenceImageUrl: undefined,
        referenceImageDataUrl: undefined,
        specificInstructions: question.specificInstructions || undefined,
        expectedOptions: question.expectedOptions
      });
      continue;
    }

    if (referenceUrl.startsWith("data:")) {
      referenceCache.set(referenceUrl, referenceUrl);
      normalizedQuestions.push({
        id: question.id,
        physicalNumber: question.physicalNumber,
        active: question.active ?? true,
        text: question.text || undefined,
        referenceImageUrl: undefined,
        referenceImageDataUrl: referenceUrl,
        specificInstructions: question.specificInstructions || undefined,
        expectedOptions: question.expectedOptions
      });
      continue;
    }

    const cachedDataUrl = referenceCache.get(referenceUrl);
    if (cachedDataUrl) {
      reusedRemoteReferenceCount += 1;
      normalizedQuestions.push({
        id: question.id,
        physicalNumber: question.physicalNumber,
        active: question.active ?? true,
        text: question.text || undefined,
        referenceImageUrl: undefined,
        referenceImageDataUrl: cachedDataUrl,
        specificInstructions: question.specificInstructions || undefined,
        expectedOptions: question.expectedOptions
      });
      continue;
    }

    try {
      log("REFERENCE_REMOTE_DOWNLOAD_STARTED", {
        questionId: question.id,
        referenceUrl,
        uniqueRemoteReferenceCount: uniqueRemoteReferenceUrls.length
      });

      const downloaded = await downloadRemoteReferenceImage(referenceUrl);
      totalOriginalSizeBytes += downloaded.originalSizeBytes;
      log("REFERENCE_REMOTE_DOWNLOAD_COMPLETED", {
        questionId: question.id,
        referenceUrl,
        originalSizeBytes: downloaded.originalSizeBytes,
        contentType: downloaded.contentType,
        downloadMs: downloaded.downloadMs,
        questionCountForReference: questions.filter((item) => (item.referenceImageUrl?.trim() ?? "") === referenceUrl).length
      });

      const compressionStartedAt = Date.now();
      const compressed = await compressReferenceImageToLimit(downloaded.file);
      totalCompressedSizeBytes += compressed.payloadBytes;
      log("REFERENCE_REMOTE_COMPRESSED", {
        questionId: question.id,
        referenceUrl,
        originalSizeBytes: downloaded.originalSizeBytes,
        compressedSizeBytes: compressed.payloadBytes,
        width: compressed.width,
        height: compressed.height,
        compressionMs: Date.now() - compressionStartedAt,
        source: "remote-url"
      });

      referenceCache.set(referenceUrl, compressed.dataUrl);
      downloadedRemoteReferences.add(referenceUrl);
      normalizedQuestions.push({
        id: question.id,
        physicalNumber: question.physicalNumber,
        active: question.active ?? true,
        text: question.text || undefined,
        referenceImageUrl: undefined,
        referenceImageDataUrl: compressed.dataUrl,
        specificInstructions: question.specificInstructions || undefined,
        expectedOptions: question.expectedOptions
      });
    } catch (error) {
      log("REFERENCE_NORMALIZATION_FAILED", {
        questionId: question.id,
        referenceUrl,
        message: error instanceof Error ? error.message : String(error)
      });
      throw new Error("REFERENCE_NORMALIZATION_FAILED");
    }
  }

  log("REFERENCE_NORMALIZATION_COMPLETED", {
    questionCount: questions.length,
    uniqueRemoteReferenceCount: uniqueRemoteReferenceUrls.length,
    downloadedReferenceCount: downloadedRemoteReferences.size,
    reusedReferenceCount: reusedRemoteReferenceCount,
    originalSizeBytes: totalOriginalSizeBytes,
    compressedSizeBytes: totalCompressedSizeBytes,
    durationMs: Date.now() - startedAt
  });

  return normalizedQuestions;
}

function normalizeProjectQuestion(input: Partial<ProjectQuestion>, index: number): ProjectQuestion {
  const normalizedInput = input as Partial<ProjectQuestion> & { questionId?: number };
  return {
    id:
      typeof normalizedInput.id === "number"
        ? normalizedInput.id
        : typeof normalizedInput.questionId === "number"
          ? normalizedInput.questionId
          : index + 1,
    physicalNumber: normalizedInput.physicalNumber ?? "",
    text: normalizedInput.text ?? "",
    referenceImageUrl: normalizedInput.referenceImageUrl ?? "",
    referenceImageFile: normalizedInput.referenceImageFile ?? "",
    specificInstructions: normalizedInput.specificInstructions ?? "",
    expectedOptions:
      Array.isArray(normalizedInput.expectedOptions) && normalizedInput.expectedOptions.length > 0
        ? normalizedInput.expectedOptions
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

function normalizeQuestionList(projectQuestions: Partial<ProjectQuestion>[] = []) {
  return projectQuestions.map((question, index) => normalizeProjectQuestion(question, index));
}

function isRealQuestionText(value: string | undefined, questionId?: number) {
  const text = value?.trim() ?? "";
  if (!text) {
    return false;
  }

  if (/^pregunta\s+\d+$/i.test(text)) {
    return false;
  }

  if (typeof questionId === "number" && text.toLowerCase() === `pregunta ${questionId}`.toLowerCase()) {
    return false;
  }

  return true;
}

function hasRealQuestionReference(question: ProjectQuestion) {
  return Boolean(isRealQuestionText(question.text, question.id) || (question.referenceImageUrl ?? "").trim());
}

function buildQuestionBankFingerprint(projectQuestions: ProjectQuestion[]) {
  return JSON.stringify(
    projectQuestions.map((question) => ({
      id: question.id,
      physicalNumber: question.physicalNumber ?? "",
      text: question.text ?? "",
      specificInstructions: question.specificInstructions ?? "",
      expectedOptions: question.expectedOptions,
      active: question.active ?? true,
      referenceImageUrl: question.referenceImageUrl ?? "",
      referenceImageFile: question.referenceImageFile ?? ""
    }))
  );
}

function buildStableHash(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return Math.abs(hash >>> 0).toString(36);
}

function buildQuestionBankHash(projectQuestions: ProjectQuestion[]) {
  const fingerprint = buildQuestionBankFingerprint(projectQuestions);
  return {
    fingerprint,
    hash: `qb_${projectQuestions.length}_${buildStableHash(fingerprint)}`
  };
}

function loadQuestionBankCacheStore() {
  try {
    const cached = window.localStorage.getItem(QUESTION_BANK_CACHE_KEY);
    if (!cached) {
      return {} as QuestionBankCacheStore;
    }

    const parsed = JSON.parse(cached) as QuestionBankCacheStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getCachedQuestionUnderstanding(cacheKey: string) {
  const store = loadQuestionBankCacheStore();
  const entry = store[cacheKey];

  if (!entry || !Array.isArray(entry.questionUnderstanding)) {
    return null;
  }

  return entry.questionUnderstanding;
}

function saveCachedQuestionUnderstanding(cacheKey: string, questionUnderstanding: VisualQuestionUnderstanding[]) {
  const store = loadQuestionBankCacheStore();
  store[cacheKey] = {
    questionUnderstanding,
    updatedAt: new Date().toISOString()
  };
  window.localStorage.setItem(QUESTION_BANK_CACHE_KEY, JSON.stringify(store));
}

function splitIntoChunks<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function createEmptyVisualPipelineV2State(): VisualPipelineState {
  return {
    phaseAQuestionBank: "pending",
    phaseBStoreAnalysis: "pending",
    phaseCAnswers: "pending",
    batchStates: [],
    answeredCount: 0,
    needsReviewCount: 0,
    pendingCount: 0,
    photosUsedCount: 0,
    batchFailures: []
  };
}

function chooseQuestionBatchSize(input: {
  questionCount: number;
  photoCount: number;
  generalInstructions: string;
}) {
  if (input.questionCount <= 2) {
    return input.questionCount;
  }

  return 2;
}

function mergeUniqueStrings(...lists: Array<string[] | undefined>) {
  return Array.from(
    new Set(
      lists
        .flatMap((list) => list ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function buildQuestionInsight(question: ProjectQuestion) {
  const base = `Q${question.id}: ${question.suggestedAnswer ?? "Sin respuesta"} (confianza ${question.confidence ?? 0})`;
  const evidence = question.evidence && question.evidence.length > 0 ? ` Evidencia: ${question.evidence.join(" | ")}` : "";
  return `${base}.${evidence}`.trim();
}

function buildMergedKnowledgeBase(base: KnowledgeBase, questions: ProjectQuestion[]): KnowledgeBase {
  const answeredQuestions = questions.filter(
    (question) =>
      (question.status === "answered" || question.status === "needs_review") &&
      question.suggestedAnswer &&
      question.suggestedAnswer !== "PENDIENTE_ANALISIS_VISUAL"
  );
  const negativeQuestions = answeredQuestions.filter((question) => (question.suggestedAnswer ?? "").trim().toLowerCase() === "no");
  const unknownQuestions = answeredQuestions.filter((question) =>
    (question.suggestedAnswer ?? "").toLowerCase().includes("no puedo responder")
  );

  return {
    ...base,
    productsAbsent: mergeUniqueStrings(
      base.productsAbsent,
      negativeQuestions.flatMap((question) => question.evidence ?? [])
    ),
    uncertainties: mergeUniqueStrings(
      base.uncertainties,
      unknownQuestions.flatMap((question) => question.evidence ?? []),
      unknownQuestions.map((question) => question.reasoning ?? "")
    ),
    crossQuestionInsights: answeredQuestions.map(buildQuestionInsight)
  };
}

function applyQuestionResultsToQuestions(questions: ProjectQuestion[], questionResults: VisualQuestionResult[]) {
  const resultsByQuestionId = new Map(questionResults.map((question) => [question.questionId, question]));

  return questions.map((question) => {
    const result = resultsByQuestionId.get(question.id);
    if (!result) {
      return question;
    }

    return {
      ...question,
      status: result.status,
      suggestedAnswer: result.answer,
      confidence: result.confidence,
      reasoning: result.reasoning,
      storePhotosUsed: result.storePhotosUsed,
      evidence: result.evidence,
      visualDiagnostic: result.visualDiagnostic
    };
  });
}

function buildVisualBatchStatesForV2(
  questions: VisualPipelineV2QuestionInput[],
  batchSize: number
): VisualBatchState[] {
  return splitIntoChunks(questions, batchSize).map((chunk, index, chunks) => ({
    batchNumber: index + 1,
    totalBatches: chunks.length,
    questionIds: chunk.map((question) => question.id),
    status: "pending",
    error: null
  }));
}

function mapVisualPipelineV2BatchState(
  batchState: VisualPipelineV2BatchStateResult,
  error: ErrorDetails | null = null
): VisualBatchState {
  return {
    batchNumber: batchState.batchNumber,
    totalBatches: batchState.totalBatches,
    questionIds: batchState.questionIds,
    status: batchState.status,
    error
  };
}

function buildVisualPipelineV2State(questions: ProjectQuestion[], batchStates: VisualBatchState[]): VisualPipelineState {
  const activeQuestions = questions.filter((question) => question.active !== false && hasRealQuestionReference(question));
  const answeredCount = activeQuestions.filter((question) => question.status === "answered").length;
  const needsReviewCount = activeQuestions.filter((question) => question.status === "needs_review").length;
  const pendingCount = activeQuestions.filter((question) => question.status === "pending" || question.status === "analyzing").length;
  const photosUsedCount = new Set(activeQuestions.flatMap((question) => question.storePhotosUsed ?? [])).size;
  const batchFailures = batchStates
    .filter((batch) => batch.status === "failed" || batch.status === "partial_failed")
    .map((batch) => ({
      batch: batch.batchNumber,
      questionIds: batch.questionIds,
      message: batch.error?.message ?? "Batch failed"
    }));

  return {
    phaseAQuestionBank: "completed",
    phaseBStoreAnalysis: "completed",
    phaseCAnswers: batchFailures.length > 0 ? "failed" : "completed",
    batchStates,
    answeredCount,
    needsReviewCount,
    pendingCount,
    photosUsedCount,
    batchFailures
  };
}

function buildVisualPipelineV2Diagnostic(input: {
  pipelineState: VisualPipelineState;
  questionCount: number;
  photoCount: number;
}) {
  const status =
    input.pipelineState.phaseCAnswers === "completed" && input.pipelineState.pendingCount === 0
      ? "completed"
      : input.pipelineState.phaseAQuestionBank === "failed" ||
          input.pipelineState.phaseBStoreAnalysis === "failed" ||
          input.pipelineState.phaseCAnswers === "failed"
        ? "failed"
        : input.pipelineState.phaseAQuestionBank === "running" ||
            input.pipelineState.phaseBStoreAnalysis === "running" ||
            input.pipelineState.phaseCAnswers === "running"
          ? "running"
          : "pending";

  return {
    pipelineVersion: "v2",
    status,
    questionCount: input.questionCount,
    photoCount: input.photoCount,
    answeredCount: input.pipelineState.answeredCount,
    needsReviewCount: input.pipelineState.needsReviewCount,
    pendingCount: input.pipelineState.pendingCount,
    batchStates: input.pipelineState.batchStates
  };
}

function buildBatchIncompleteErrorDetails(input: {
  batch: number;
  expectedQuestionIds: number[];
  receivedQuestionIds: number[];
  missingQuestionIds: number[];
  endpoint: string;
}): ErrorDetails {
  return {
    message: `Batch incompleto: faltan preguntas ${input.missingQuestionIds.join(", ")}.`,
    endpoint: input.endpoint,
    status: 200,
    body: {
      ok: true,
      error: "PARTIAL_BATCH_RESULT",
      expectedQuestionIds: input.expectedQuestionIds,
      receivedQuestionIds: input.receivedQuestionIds,
      missingQuestionIds: input.missingQuestionIds
    },
    stack: null,
    batch: input.batch,
    questionIds: input.expectedQuestionIds,
    expectedQuestionIds: input.expectedQuestionIds,
    receivedQuestionIds: input.receivedQuestionIds,
    missingQuestionIds: input.missingQuestionIds
  };
}

function buildFallbackTimeline(payload: DirectPreviewPayload): TimelineItem[] {
  const screenshots = payload.screenshotPaths ?? [];
  const stepScreenshot = (pattern: string) => screenshots.find((item) => item.includes(pattern)) ?? null;
  return [
    {
      key: "starting-store",
      label: "Iniciando tienda",
      status: "completed",
      timestamp: null,
      message: "Corrida ejecutada en modo directo",
      error: null,
      screenshotPath: null,
      screenshotUrl: null
    },
    {
      key: "opening-survey",
      label: "Abriendo survey",
      status: stepScreenshot("01-opening-survey") ? "completed" : "pending",
      timestamp: null,
      message: stepScreenshot("01-opening-survey") ? "Survey abierto" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("01-opening-survey"),
      screenshotUrl: null
    },
    {
      key: "entering-store-code",
      label: "Ingresando Store Code",
      status: stepScreenshot("02-store-code-filled") ? "completed" : "pending",
      timestamp: null,
      message: stepScreenshot("02-store-code-filled") ? "Store Code cargado" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("02-store-code-filled"),
      screenshotUrl: null
    },
    {
      key: "detecting-validator-screen",
      label: "Detectando pantalla de validator",
      status: stepScreenshot("04-validator-screen-detected") ? "completed" : "pending",
      timestamp: null,
      message: stepScreenshot("04-validator-screen-detected") ? "Pantalla de validator detectada" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("04-validator-screen-detected"),
      screenshotUrl: null
    },
    {
      key: "writing-validator-code",
      label: "Escribiendo Validator Code",
      status: stepScreenshot("05-validator-code-filled") ? "completed" : "pending",
      timestamp: null,
      message: stepScreenshot("05-validator-code-filled") ? "Validator Code cargado" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("05-validator-code-filled"),
      screenshotUrl: null
    },
    {
      key: "extracting-image-links",
      label: "Extrayendo links de imagenes",
      status: stepScreenshot("06-image-links-detected") ? "completed" : "pending",
      timestamp: null,
      message: stepScreenshot("06-image-links-detected") ? "Links de imagenes detectados" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("06-image-links-detected"),
      screenshotUrl: null
    },
    {
      key: "opening-images",
      label: "Abriendo imagenes",
      status: (payload.imageLinks?.length ?? 0) > 0 ? "completed" : "pending",
      timestamp: null,
      message: (payload.imageLinks?.length ?? 0) > 0 ? "Fotos reales detectadas" : "Pendiente",
      error: null,
      screenshotPath: null,
      screenshotUrl: null
    },
    {
      key: "entering-first-question",
      label: "Entrando a primera pregunta",
      status: stepScreenshot("07-after-continue") ? "completed" : "pending",
      timestamp: null,
      message: stepScreenshot("07-after-continue") ? "Encuesta continuada" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("07-after-continue"),
      screenshotUrl: null
    },
    {
      key: "first-question-detected",
      label: "Primera pregunta detectada",
      status: payload.detectedFirstQuestion ? "completed" : "pending",
      timestamp: null,
      message: payload.detectedFirstQuestion ? "Primera pregunta detectada" : "Pendiente",
      error: null,
      screenshotPath: stepScreenshot("08-main-page"),
      screenshotUrl: null
    },
    {
      key: "ready-for-visual-analysis",
      label: "Listo para analisis visual",
      status: payload.detectedFirstQuestion ? "completed" : "pending",
      timestamp: null,
      message: payload.detectedFirstQuestion ? "Listo para analisis visual" : "Pendiente",
      error: null,
      screenshotPath: null,
      screenshotUrl: null
    }
  ];
}

function buildFallbackRun(payload: DirectPreviewPayload, currentStore: string, surveyUrl: string, validatorCode: string): AuditRun {
  const screenshotUrls = payload.screenshotUrls ?? [];
  const screenshotPaths = payload.screenshotPaths ?? [];
  const screenshotUrlByPath = new Map(screenshotPaths.map((path, index) => [path, screenshotUrls[index] ?? null]));
  return {
    id: "direct_worker_fallback",
    status: payload.ok ? "completed" : "failed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: payload.currentStep ?? "direct_worker_fallback",
    title: payload.title ?? null,
    finalUrl: payload.finalUrl ?? surveyUrl,
    detectedFirstQuestion: payload.detectedFirstQuestion ?? false,
    probableQuestionText: payload.probableQuestionText ?? null,
    pageTextPreview: payload.pageTextPreview ?? "",
    radioCount: payload.radioCount ?? 0,
    finalBodyTextLength: payload.finalBodyTextLength ?? 0,
    pollingIterations: payload.pollingIterations ?? 0,
    firstQuestionDetectedAtSecond: payload.firstQuestionDetectedAtSecond ?? null,
    currentScreenshotUrl: payload.currentScreenshotUrl ?? null,
    timeline: buildFallbackTimeline(payload).map((item) => ({
      ...item,
      screenshotUrl:
        item.screenshotPath
          ? screenshotUrls[screenshotPaths.findIndex((path) => path === item.screenshotPath)] ?? null
          : null
    })),
    screenshots: screenshotPaths.map((path, index) => ({
      id: `${index}-${path}`,
      label: path.split("/").at(-1) ?? `screenshot-${index + 1}`,
      stepKey: deriveScreenshotStepKey(path),
      fileName: path.split("/").at(-1) ?? path,
      path,
      createdAt: new Date().toISOString(),
      url: screenshotUrls[index] ?? null
    })),
    imageLinks: payload.imageLinks ?? [],
    projectQuestions: [],
    generalInstructions: "",
    storeCode: currentStore,
    surveyUrl,
    validatorCode,
    workerEndpoint: "/api/new-audit/preview",
    workerStatusCode: payload.ok ? 200 : 500,
    workerErrorBody: payload.ok ? null : payload,
    error: payload.ok ? null : payload.error ?? "direct_worker_fallback_failed",
    stack: payload.stack ?? null,
    traceability: payload.traceability ?? null,
    questionMatchDebug: payload.questionMatchDebug
      ? {
          ...payload.questionMatchDebug,
          screenshotUrl:
            payload.questionMatchDebug.screenshotPath
              ? (screenshotUrlByPath.get(payload.questionMatchDebug.screenshotPath) ?? null)
              : null
        }
      : null,
    surveyCompletionNumber: payload.surveyCompletionNumber ?? null,
    finalState: payload.finalState ?? null,
    preparedSessionId: payload.preparedSessionId ?? null,
    stepperSessionId: payload.stepperSessionId ?? null,
    currentQuestion: payload.currentQuestion ?? null,
    actionLogs: payload.actionLogs ?? [],
    answeredQuestionIds: payload.answeredQuestionIds ?? []
  };
}

export function NewAuditWorkspace() {
  const [projectId, setProjectId] = useState("shave-care-gillette");
  const [surveyUrl, setSurveyUrl] = useState(DEFAULT_SURVEY_URL);
  const [validatorCode, setValidatorCode] = useState("234");
  const [storeList, setStoreList] = useState("0608");
  const [projectQuestions, setProjectQuestions] = useState<ProjectQuestion[]>([]);
  const [generalInstructions, setGeneralInstructions] = useState(DEFAULT_GENERAL_INSTRUCTIONS);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("Draft");
  const [currentStore, setCurrentStore] = useState("Sin datos reales todavia");
  const [runId, setRunId] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<"runId_observable" | "direct_worker_fallback">("runId_observable");
  const [activeRun, setActiveRun] = useState<AuditRun | null>(null);
  const [previewError, setPreviewError] = useState<ErrorDetails | null>(null);
  const [visualAnalysisMessage, setVisualAnalysisMessage] = useState<string | null>(null);
  const [visualAnalyzing, setVisualAnalyzing] = useState(false);
  const [surveyAnswering, setSurveyAnswering] = useState(false);
  const [surveyContinuing, setSurveyContinuing] = useState(false);
  const [surveyCompleting, setSurveyCompleting] = useState(false);
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoLoadState>>({});
  const [referenceImageSessions, setReferenceImageSessions] = useState<Record<number, ReferenceImageSession>>({});
  const [perPhotoAnalysis, setPerPhotoAnalysis] = useState<PerPhotoAnalysis[]>([]);
  const [lastVisualRequestMeta, setLastVisualRequestMeta] = useState<VisualRequestMeta>({
    payloadSizeBytes: 0,
    photoCount: 0,
    questionCount: 0,
    rawText: null,
    status: null
  });
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>({
    summary: "",
    brandsDetected: [],
    productsDetected: [],
    productsAbsent: [],
    categoriesDetected: [],
    sectionsDetected: [],
    orderingDetected: [],
    shelfLocations: [],
    signageDetected: [],
    visiblePrices: [],
    promotionsDetected: [],
    facingDisplaySignals: [],
    relevantVisualSignals: [],
    uncertainties: [],
    crossQuestionInsights: []
  });
  const [questionUnderstanding, setQuestionUnderstanding] = useState<VisualQuestionUnderstanding[]>([]);
  const [questionUnderstandingFingerprint, setQuestionUnderstandingFingerprint] = useState<string | null>(null);
  const [visualAnalysisLogs, setVisualAnalysisLogs] = useState<VisualAnalysisLog[]>([]);
  const [visualPipelineState, setVisualPipelineState] = useState<VisualPipelineState>(createEmptyVisualPipelineV2State());
  const importJsonRef = useRef<HTMLInputElement | null>(null);
  const referenceImageSessionsRef = useRef<Record<number, ReferenceImageSession>>({});
  const serializedQuestionsRef = useRef<SerializedVisualQuestion[]>([]);
  const storePhotosRef = useRef<
    Array<{
      index: number;
      url: string;
      previewUrl: string;
      source: string;
      text: string;
    }>
  >([]);

  useEffect(() => {
    referenceImageSessionsRef.current = referenceImageSessions;
  }, [referenceImageSessions]);

  useEffect(() => {
    const activeQuestions = projectQuestions.filter((question) => question.active !== false && hasRealQuestionReference(question));
    const { fingerprint, hash } = buildQuestionBankHash(activeQuestions);
    const cachedUnderstanding = getCachedQuestionUnderstanding(hash);

    if (cachedUnderstanding) {
      setQuestionUnderstanding(cachedUnderstanding);
      setQuestionUnderstandingFingerprint(fingerprint);
    }
  }, [projectQuestions]);

  const stores = useMemo(
    () =>
      storeList
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    [storeList]
  );

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;
    let intervalId = 0;

    async function pollRun() {
      try {
        const response = await fetch(`/api/new-audit/runs/${runId}`, { cache: "no-store" });
        const payload = (await response.json()) as { run?: AuditRun; error?: string };

        if (!response.ok || !payload.run) {
          if (response.status === 404 || payload.error === "run_not_found") {
            setRunId(null);
            await runDirectWorkerFallback(currentStore);
            return;
          }

          throw new Error(payload.error ?? "run_status_failed");
        }

        if (cancelled) {
          return;
        }

        const run = payload.run;

        setActiveRun(run);
        setProjectQuestions((current) =>
          normalizeQuestionList(run.projectQuestions).map((question, index) => ({
            ...question,
            referenceImageUrl:
              referenceImageSessionsRef.current[question.id]?.previewUrl ?? current[index]?.referenceImageUrl ?? question.referenceImageUrl,
            referenceImageFile:
              referenceImageSessionsRef.current[question.id]?.file.name ?? current[index]?.referenceImageFile ?? question.referenceImageFile
          }))
        );
        setGeneralInstructions(run.generalInstructions);
        setCurrentStore(run.storeCode);
        setWorkspaceStatus(
          run.status === "running" ? "Running" : run.status === "completed" ? "Ready" : "Failed"
        );
        setPreviewError(
          run.error
            ? {
                message: run.error,
                endpoint: run.workerEndpoint ?? null,
                status: run.workerStatusCode ?? null,
                body: run.workerErrorBody ?? null,
                stack: run.stack ?? null
              }
            : null
        );

        if (run.status !== "running") {
          window.clearInterval(intervalId);
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceStatus("Failed");
          setPreviewError({ message: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    void pollRun();
    intervalId = window.setInterval(() => {
      void pollRun();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [runId]);

  async function runDirectWorkerFallback(storeCode: string) {
    setExecutionMode("direct_worker_fallback");

    const response = await fetch("/api/new-audit/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        surveyUrl,
        storeCode,
        validatorCode
      })
    });

    const payload = (await response.json()) as
      | { mode?: "real"; payload?: DirectPreviewPayload; error?: string; endpoint?: string | null; status?: number; body?: unknown }
      | null;

    if (!response.ok || !payload || !("payload" in payload) || !payload.payload) {
      setWorkspaceStatus("Failed");
      setPreviewError({
        message: payload && "error" in payload && payload.error ? payload.error : "direct_worker_fallback_failed",
        endpoint: payload && "endpoint" in payload ? payload.endpoint ?? "/api/new-audit/preview" : "/api/new-audit/preview",
        status: payload && "status" in payload ? payload.status ?? response.status : response.status,
        body: payload && "body" in payload ? payload.body : payload
      });
      return;
    }

    const fallbackRun = buildFallbackRun(payload.payload, storeCode, surveyUrl, validatorCode);
    setActiveRun((current) => ({
      ...fallbackRun,
      projectQuestions: current?.projectQuestions?.length ? current.projectQuestions : projectQuestions,
      generalInstructions: generalInstructions
    }));
    setWorkspaceStatus(payload.payload.ok ? "Ready" : "Failed");
    setPreviewError(
      payload.payload.ok
        ? null
        : {
            message: payload.payload.error ?? "direct_worker_fallback_failed",
            endpoint: "/api/new-audit/preview",
            status: response.status,
            body: payload.payload,
            stack: payload.payload.stack ?? null
          }
    );
    setVisualAnalysisMessage(payload.payload.ok ? "Listo para analisis visual" : null);
  }

  useEffect(() => {
    return () => {
      Object.values(referenceImageSessionsRef.current).forEach((session) => {
        URL.revokeObjectURL(session.previewUrl);
      });
    };
  }, []);

  const screenshotGroups = useMemo(() => groupScreenshotsByStep(activeRun?.screenshots ?? []), [activeRun?.screenshots]);
  const imageLinks = activeRun?.imageLinks ?? [];
  const traceability = activeRun?.traceability ?? null;
  const executionTimeline = useMemo(() => buildExecutionTimeline(activeRun), [activeRun]);
  const timelineItems = executionTimeline.length > 0 ? executionTimeline : activeRun?.timeline ?? [];
  const screenshotByPath = useMemo(
    () => new Map((activeRun?.screenshots ?? []).map((screenshot) => [screenshot.path, screenshot])),
    [activeRun?.screenshots]
  );
  const questionEvidenceById = useMemo(() => {
    const evidenceMap = new Map<number, QuestionEvidenceReference[]>();

    const appendEvidence = (questionId: number, evidence: QuestionEvidenceReference) => {
      const current = evidenceMap.get(questionId) ?? [];
      current.push(evidence);
      evidenceMap.set(questionId, current);
    };

    if (traceability?.questionTraces?.length) {
      traceability.questionTraces.forEach((item) => {
        const references: Array<{ kind: QuestionEvidenceReference["kind"]; path: string | null; url?: string | null }> = [
          { kind: "before", path: item.beforeScreenshotPath, url: item.beforeScreenshotUrl ?? null },
          { kind: "selected", path: item.selectedScreenshotPath, url: item.selectedScreenshotUrl ?? null },
          { kind: "after", path: item.afterScreenshotPath, url: item.afterScreenshotUrl ?? null }
        ];

        references.forEach((reference) => {
          if (!reference.path) {
            return;
          }

          const screenshot = screenshotByPath.get(reference.path);
          appendEvidence(item.matchedQuestionId, {
            kind: reference.kind,
            label: screenshot?.label ?? reference.path.split("/").at(-1) ?? reference.path,
            screenshotPath: reference.path,
            screenshotUrl: reference.url ?? screenshot?.url ?? null,
            captureId: buildCaptureId(reference.path)
          });
        });
      });

      return evidenceMap;
    }

    const answeredQuestionIds = activeRun?.answeredQuestionIds ?? [];
    const answeredScreenshots = (activeRun?.screenshots ?? []).filter((item) => /survey-answered-\d+\.png$/i.test(item.fileName));

    answeredQuestionIds.forEach((questionId, index) => {
      const screenshot = answeredScreenshots[index];
      if (!screenshot) {
        return;
      }

      appendEvidence(questionId, {
        kind: "after",
        label: screenshot.label,
        screenshotPath: screenshot.path,
        screenshotUrl: screenshot.url,
        captureId: buildCaptureId(screenshot.path)
      });
    });

    return evidenceMap;
  }, [activeRun?.answeredQuestionIds, activeRun?.screenshots, screenshotByPath, traceability?.questionTraces]);
  const currentScreenshotUrl = activeRun?.currentScreenshotUrl ?? null;
  const currentQuestion = activeRun?.probableQuestionText ?? "Sin datos reales todavia";
  const realPreloadedQuestions = projectQuestions.filter((question) => hasRealQuestionReference(question));
  const activeProjectQuestions = projectQuestions.filter((question) => question.active !== false && hasRealQuestionReference(question));
  const traceabilityQuestionById = useMemo(
    () => new Map((traceability?.questionTraces ?? []).map((entry) => [entry.matchedQuestionId, entry])),
    [traceability?.questionTraces]
  );
  const questionExecutionEntries = useMemo(
    () =>
      activeProjectQuestions.map((question) => {
        const traceEntry = traceabilityQuestionById.get(question.id) ?? null;
        return {
          question,
          traceEntry,
          evidenceReferences: questionEvidenceById.get(question.id) ?? [],
          state:
            traceEntry?.status === "failed"
              ? "error"
              : traceEntry
                ? "completada"
                : question.status === "needs_review"
                  ? "needs_review"
                  : "pendiente",
          error: traceEntry?.error ?? null
        };
      }),
    [activeProjectQuestions, questionEvidenceById, traceabilityQuestionById]
  );
  const questionsWithImageCount = realPreloadedQuestions.filter((question) => Boolean(question.referenceImageUrl)).length;
  const realPreloadedQuestionsCount = realPreloadedQuestions.length;
  const physicalSurveyQuestionsDetectedCount = activeRun?.detectedFirstQuestion ? 1 : 0;
  const pendingQuestionsCount = activeProjectQuestions.filter((question) => question.status === "pending").length;
  const answeredQuestionsCount = activeProjectQuestions.filter((question) => question.status === "answered").length;
  const inactiveQuestionsCount = realPreloadedQuestions.filter((question) => question.active === false).length;
  const canAnalyzeVisually =
    imageLinks.length > 0 && activeProjectQuestions.length > 0 && generalInstructions.trim().length > 0;
  const canAnswerSurveyUntilPhoto =
    activeProjectQuestions.length > 0 &&
    activeProjectQuestions.every(
      (question) =>
        (question.status === "answered" || question.status === "needs_review") &&
        Boolean(question.suggestedAnswer) &&
        question.suggestedAnswer !== "PENDIENTE_ANALISIS_VISUAL"
    );
  const canCompleteSurveyWithTraceability = canAnswerSurveyUntilPhoto;
  const canContinueStepper = activeRun?.finalState === "WAITING_FOR_CONTINUE" && Boolean(activeRun?.stepperSessionId);
  const canSubmitConfirmedSurvey =
    canCompleteSurveyWithTraceability &&
    activeRun?.finalState === "WAITING_FOR_HUMAN_SUBMIT_CONFIRMATION" &&
    Boolean(activeRun?.preparedSessionId) &&
    Boolean(traceability?.surveyFinalReview?.path) &&
    (traceability?.questionTraces ?? []).every((entry) => entry.status !== "failed");

  function pushVisualLog(message: string, detail?: unknown) {
    setVisualAnalysisLogs((current) => [
      ...current,
      {
        timestamp: new Date().toISOString(),
        message,
        detail
      }
    ]);
  }

  function relayLiveRunActionLogs(
    actionLogs: Array<{ event?: string; detail?: unknown }> | undefined,
    options: {
      includeNavigationCompleted?: boolean;
    } = {}
  ) {
    if (!Array.isArray(actionLogs)) {
      return;
    }

    let navigationCompletedLogged = false;

    actionLogs.forEach((entry) => {
      if (typeof entry?.event !== "string" || !entry.event) {
        return;
      }

      pushVisualLog(entry.event, entry.detail);

      if (options.includeNavigationCompleted && !navigationCompletedLogged && entry.event === "VISIBLE_QUESTION_EXTRACTED") {
        navigationCompletedLogged = true;
        pushVisualLog("PAGE_NAVIGATION_COMPLETED", entry.detail);
      }

      if (entry.event === "VISIBLE_QUESTION_EXTRACTED") {
        pushVisualLog("VISIBLE_QUESTION_DETECTED", entry.detail);
      }

      if (entry.event === "QUESTION_MATCHED") {
        pushVisualLog("QUESTION_MATCHED_TO_RESULT", entry.detail);
      }

      if (entry.event === "ANSWER_SELECTED") {
        pushVisualLog("ANSWER_OPTION_SELECTED", entry.detail);
        pushVisualLog("ANSWER_CONFIRMED_ON_PAGE", entry.detail);
      }

      if (entry.event === "CONTINUE_CLICKED") {
        pushVisualLog("NEXT_QUESTION_CLICKED", entry.detail);
      }

      if (entry.event === "NEEDS_REVIEW_OPTION_MATCH") {
        pushVisualLog("OPTION_NOT_FOUND", entry.detail);
      }

      if (entry.event === "NEEDS_REVIEW_QUESTION_MATCH") {
        pushVisualLog("VISIBLE_QUESTION_NOT_FOUND", entry.detail);
      }
    });
  }

  function registerVisualAnalyzeInteraction(eventName: string, source: string) {
    const detail = {
      source,
      visualAnalyzing,
      workspaceStatus,
      canAnalyzeVisually,
      imageLinksCount: imageLinks.length,
      realPreloadedQuestionsCount,
      generalInstructionsLength: generalInstructions.trim().length
    };

    console.log(eventName, detail);
    setVisualAnalysisLogs((current) => [
      ...current,
      {
        timestamp: new Date().toISOString(),
        message: eventName,
        detail
      }
    ]);
  }

  const batchRows = useMemo(
    () =>
      stores.map((storeCode) => {
        if (storeCode !== currentStore) {
          return {
            storeCode,
            status: "Pendiente",
            questionnaireNumber: "Sin datos reales todavia"
          };
        }

        if (workspaceStatus === "Failed") {
          return {
            storeCode,
            status: "Error real",
            questionnaireNumber: "Sin datos reales todavia"
          };
        }

        if (workspaceStatus === "Ready") {
          return {
            storeCode,
            status: "Lista para analisis visual",
            questionnaireNumber: "Sin datos reales todavia"
          };
        }

        return {
          storeCode,
          status: workspaceStatus,
          questionnaireNumber: "Sin datos reales todavia"
        };
      }),
    [currentStore, stores, workspaceStatus]
  );

  async function handleStart() {
    const firstStore = stores[0];

    if (!firstStore) {
      setPreviewError({ message: "Debes ingresar al menos un Store Code." });
      return;
    }

    setWorkspaceStatus("Running");
    setExecutionMode("runId_observable");
    setCurrentStore(firstStore);
    setActiveRun(null);
    setRunId(null);
    setPreviewError(null);
    setVisualAnalysisMessage(null);
    setVisualAnalysisLogs([]);
    setSurveyAnswering(false);
    setSurveyCompleting(false);
    setSurveySubmitting(false);
    setVisualPipelineState(createEmptyVisualPipelineV2State());
    serializedQuestionsRef.current = [];
    storePhotosRef.current = [];
    setLastVisualRequestMeta({
      payloadSizeBytes: 0,
      photoCount: 0,
      questionCount: 0,
      rawText: null,
      status: null
    });
    setPerPhotoAnalysis([]);
    setKnowledgeBase({
      summary: "",
      brandsDetected: [],
      productsDetected: [],
      productsAbsent: [],
      categoriesDetected: [],
      sectionsDetected: [],
      orderingDetected: [],
      shelfLocations: [],
      signageDetected: [],
      visiblePrices: [],
      promotionsDetected: [],
      facingDisplaySignals: [],
      relevantVisualSignals: [],
      uncertainties: [],
      crossQuestionInsights: []
    });
    setPhotoStates({});

    try {
      const serializedQuestions = await Promise.all(
        projectQuestions.map(async (question) => {
          const sessionImage = referenceImageSessions[question.id];
          const referenceImageDataUrl = sessionImage ? await fileToDataUrl(sessionImage.file) : undefined;

          return {
            ...question,
            physicalNumber: question.physicalNumber,
            active: question.active ?? true,
            referenceImageUrl:
              sessionImage ? undefined : question.referenceImageUrl,
            referenceImageFile: sessionImage?.file.name ?? question.referenceImageFile,
            referenceImageDataUrl
          };
        })
      );

      const response = await fetch("/api/new-audit/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectId,
          surveyUrl,
          storeCode: firstStore,
          validatorCode,
          projectQuestions: serializedQuestions,
          generalInstructions
        })
      });

      const payload = (await response.json()) as { ok?: boolean; runId?: string; error?: string };
      if (!response.ok || !payload.runId) {
        await runDirectWorkerFallback(firstStore);
        return;
      }

      setRunId(payload.runId);
      pushVisualLog("START_RUN_ID", {
        runId: payload.runId,
        valid: isValidUuid(payload.runId)
      });
      setVisualAnalysisMessage("Listo para analisis visual");
    } catch (error) {
      await runDirectWorkerFallback(firstStore).catch(() => {
        setWorkspaceStatus("Failed");
        setPreviewError({ message: error instanceof Error ? error.message : String(error) });
      });
    }
  }

  function handleStop() {
    setWorkspaceStatus("Draft");
    setCurrentStore("Sin datos reales todavia");
    setRunId(null);
    setExecutionMode("runId_observable");
    setActiveRun(null);
    setPreviewError(null);
    setVisualAnalysisMessage(null);
    setVisualAnalyzing(false);
    setSurveyAnswering(false);
    setSurveyCompleting(false);
    setSurveySubmitting(false);
    setVisualAnalysisLogs([]);
    setLastVisualRequestMeta({
      payloadSizeBytes: 0,
      photoCount: 0,
      questionCount: 0,
      rawText: null,
      status: null
    });
    setPhotoStates({});
  }

  function handleLoadTemplate() {
    Object.values(referenceImageSessionsRef.current).forEach((session) => {
      URL.revokeObjectURL(session.previewUrl);
    });
    referenceImageSessionsRef.current = {};
    setReferenceImageSessions({});
    setProjectQuestions([]);
  }

  function handleAddQuestion() {
    setProjectQuestions((current) => {
      const nextId = current.length > 0 ? Math.max(...current.map((question) => question.id)) + 1 : 1;
      return [...current, buildEmptyQuestion(nextId)];
    });
  }

  function handleQuestionChange(index: number, patch: Partial<ProjectQuestion>) {
    setProjectQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...question,
              ...patch
            }
          : question
      )
    );
  }

  function handleExportJson() {
    downloadJson("project-question-bank.json", {
      projectQuestions: projectQuestions.map((question) => ({
        questionId: question.id,
        id: question.id,
        physicalNumber: question.physicalNumber ?? "",
        text: question.text ?? "",
        referenceImageUrl: question.referenceImageUrl ?? "",
        referenceImageFile: question.referenceImageFile ?? "",
        specificInstructions: question.specificInstructions ?? "",
        expectedOptions: question.expectedOptions,
        active: question.active ?? true,
        status: question.status,
        suggestedAnswer: question.suggestedAnswer,
        confidence: question.confidence,
        reasoning: question.reasoning,
        storePhotosUsed: question.storePhotosUsed,
        evidence: question.evidence
      })),
      generalInstructions
    });
  }

  async function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as {
        projectQuestions?: Partial<ProjectQuestion>[];
        generalInstructions?: string;
      } | Partial<ProjectQuestion>[];

      if (Array.isArray(parsed)) {
        Object.values(referenceImageSessionsRef.current).forEach((session) => {
          URL.revokeObjectURL(session.previewUrl);
        });
        referenceImageSessionsRef.current = {};
        setReferenceImageSessions({});
        setProjectQuestions(normalizeQuestionList(parsed));
      } else {
        Object.values(referenceImageSessionsRef.current).forEach((session) => {
          URL.revokeObjectURL(session.previewUrl);
        });
        referenceImageSessionsRef.current = {};
        setReferenceImageSessions({});
        setProjectQuestions(normalizeQuestionList(parsed.projectQuestions ?? []));
        if (typeof parsed.generalInstructions === "string") {
          setGeneralInstructions(parsed.generalInstructions);
        }
      }

      setPreviewError(null);
    } catch (error) {
      setPreviewError({ message: error instanceof Error ? error.message : "No se pudo importar el JSON." });
    } finally {
      event.target.value = "";
    }
  }

  async function handleReferenceImageUpload(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const questionId = projectQuestions[index]?.id ?? index + 1;
    const previewUrl = URL.createObjectURL(file);

    setReferenceImageSessions((current) => {
      const previous = current[questionId];
      if (previous) {
        URL.revokeObjectURL(previous.previewUrl);
      }

      return {
        ...current,
        [questionId]: {
          file,
          previewUrl
        }
      };
    });
    handleQuestionChange(index, {
      referenceImageUrl: previewUrl,
      referenceImageFile: file.name
    });
    event.target.value = "";
  }

  function handleExportCsv() {
    downloadCsv("new-audit-results.csv", [
      ["storeCode", "status", "questionnaireNumber"],
      ...batchRows.map((row) => [row.storeCode, row.status, row.questionnaireNumber])
    ]);
  }

  // LEGACY visual-pipeline-v1.
  // El flujo nuevo usa lib/visual-pipeline-v2.ts y no depende de los helpers de orquestación que siguen.
  async function fetchVisualStage<T>(input: {
    endpoint: string;
    payload: unknown;
    payloadSizeBytes: number;
    photoCount: number;
    questionCount: number;
    timeoutMessage?: string;
  }) {
    pushVisualLog("endpoint llamado", { endpoint: input.endpoint });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 75_000);

    let response: Response;
    try {
      response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input.payload),
        signal: controller.signal
      });
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          input.timeoutMessage ??
            "La etapa excedio el tiempo permitido. Intenta nuevamente o reduce el tamaño del lote."
        );
      }

      throw error;
    }

    window.clearTimeout(timeoutId);

    const rawText = await response.text();
    setLastVisualRequestMeta({
      payloadSizeBytes: input.payloadSizeBytes,
      photoCount: input.photoCount,
      questionCount: input.questionCount,
      rawText,
      status: response.status
    });
    pushVisualLog("status", { endpoint: input.endpoint, status: response.status, payloadSizeBytes: input.payloadSizeBytes });
    pushVisualLog("rawText", rawText);

    let parsed: T | { error?: unknown } | string;
    try {
      parsed = rawText ? (JSON.parse(rawText) as T | { error?: unknown }) : "";
    } catch {
      parsed = rawText;
    }

    if (!response.ok) {
      if (response.status === 504 || rawText.includes("FUNCTION_INVOCATION_TIMEOUT")) {
        throw new Error(
          input.timeoutMessage ??
            "La etapa excedio el timeout del servidor. Se recomienda reintentar o usar lotes más pequeños."
        );
      }

      const payloadError =
        typeof parsed === "object" && parsed && "error" in parsed ? parsed.error : null;
      const structuredErrorMessage =
        payloadError &&
        typeof payloadError === "object" &&
        "message" in payloadError &&
        typeof (payloadError as { message?: unknown }).message === "string"
          ? (payloadError as { message: string }).message
          : typeof payloadError === "string"
            ? payloadError
            : typeof parsed === "string"
            ? parsed
            : "VISUAL_ANALYSIS_FAILED";
      throw Object.assign(new Error(structuredErrorMessage), {
        endpoint: input.endpoint,
        status: response.status,
        body: parsed,
        rawText
      });
    }

    if (typeof parsed === "string") {
      throw new Error(parsed || "VISUAL_ANALYSIS_FAILED");
    }

    return {
      response,
      rawText,
      parsed: parsed as T
    };
  }

  async function analyzeQuestionBankInBatches(input: {
    serializedQuestions: Array<{
      id: number;
      physicalNumber?: string;
      active: boolean;
      text?: string;
      referenceImageUrl?: string;
      referenceImageDataUrl?: string;
      specificInstructions?: string;
      expectedOptions: string[];
    }>;
    generalInstructions: string;
  }): Promise<{
    questionUnderstanding: VisualQuestionUnderstanding[];
    receivedQuestionIds: number[];
    missingQuestionIds: number[];
    status: "completed" | "partial_failed";
  }> {
    const chunks = splitIntoChunks(input.serializedQuestions, QUESTION_BANK_BATCH_SIZE);
    const mergedUnderstanding: VisualQuestionUnderstanding[] = [];
    const receivedQuestionIds: number[] = [];
    const failedQuestionIds = new Set<number>();
    let lastStatus: number | null = null;
    let lastRawText: string | null = null;
    let lastBody: unknown = null;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index] ?? [];
      const chunkPayload = {
        projectQuestions: chunk,
        generalInstructions: input.generalInstructions
      };
      const payloadSizeBytes = estimateUtf8Bytes(JSON.stringify(chunkPayload));

      pushVisualLog("QUESTION_BANK_BATCH_STARTED", {
        batch: index + 1,
        totalBatches: chunks.length,
        questionCount: chunk.length,
        payloadSizeBytes
      });

      setVisualAnalysisMessage(
        `Analizando banco ${Math.min((index + 1) * QUESTION_BANK_BATCH_SIZE, input.serializedQuestions.length)}/${input.serializedQuestions.length}...`
      );

      let attempt = 0;
      while (attempt <= QUESTION_BANK_BATCH_RETRIES) {
        try {
          const questionBankResult = await fetchVisualStage<{ questionUnderstanding: VisualQuestionUnderstanding[] }>({
            endpoint: "/api/new-audit/analyze-question-bank",
            payload: chunkPayload,
            payloadSizeBytes,
            photoCount: 0,
            questionCount: chunk.length,
            timeoutMessage: `El lote ${index + 1} del banco de preguntas excedio el timeout.`
          });

          lastStatus = questionBankResult.response.status;
          lastRawText = questionBankResult.rawText;
          lastBody = questionBankResult.parsed;
          const resolved = questionBankResult.parsed.questionUnderstanding ?? [];
          mergedUnderstanding.push(...resolved);
          receivedQuestionIds.push(...resolved.map((item) => item.questionId));

          pushVisualLog("QUESTION_BANK_BATCH_COMPLETED", {
            batch: index + 1,
            totalBatches: chunks.length,
            resolvedQuestions: resolved.length
          });
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pushVisualLog("QUESTION_BANK_BATCH_FAILED", {
            batch: index + 1,
            totalBatches: chunks.length,
            attempt: attempt + 1,
            error: message
          });

          if (attempt >= QUESTION_BANK_BATCH_RETRIES) {
            pushVisualLog("QUESTION_BANK_BATCH_FAILED", {
              batch: index + 1,
              totalBatches: chunks.length,
              attempt: attempt + 1,
              error: message,
              questionIds: chunk.map((question) => question.id)
            });
            chunk.forEach((question) => failedQuestionIds.add(question.id));
            break;
          }

          setVisualAnalysisMessage(`Reintentando banco ${index + 1}/${chunks.length}...`);
          attempt += 1;
        }
      }
    }

    return {
      questionUnderstanding: mergedUnderstanding,
      receivedQuestionIds,
      missingQuestionIds: input.serializedQuestions
        .map((question) => question.id)
        .filter((questionId) => !receivedQuestionIds.includes(questionId) || failedQuestionIds.has(questionId)),
      status: failedQuestionIds.size > 0 ? "partial_failed" : "completed"
    };
  }

  function buildStorePhotosForVisualAnalysis() {
    return imageLinks.map((image) => ({
      index: image.index,
      url: image.href,
      previewUrl: image.href,
      source: "survey",
      text: image.text
    }));
  }

  function buildBatchErrorDetails(input: {
    error: unknown;
    endpoint: string;
    batch: number;
    questionIds: number[];
  }): ErrorDetails {
    const errorWithDetails = input.error as Error & {
      endpoint?: string;
      status?: number;
      body?: unknown;
      rawText?: string;
    };
    const diagnostics =
      errorWithDetails.body &&
      typeof errorWithDetails.body === "object" &&
      "diagnostics" in (errorWithDetails.body as Record<string, unknown>)
        ? ((errorWithDetails.body as { diagnostics?: Record<string, unknown> }).diagnostics ?? null)
        : null;

    return {
      message: errorWithDetails.message || "VISUAL_ANALYSIS_FAILED",
      endpoint: errorWithDetails.endpoint ?? input.endpoint,
      status: errorWithDetails.status ?? null,
      body: errorWithDetails.body,
      stack: errorWithDetails.stack ?? null,
      batch: input.batch,
      questionIds: input.questionIds,
      openAiApiKeyConfigured:
        diagnostics && typeof diagnostics.openAiApiKeyConfigured === "boolean" ? diagnostics.openAiApiKeyConfigured : null,
      storePhotosReceived:
        diagnostics && typeof diagnostics.storePhotosReceived === "number" ? diagnostics.storePhotosReceived : null,
      projectQuestionsReceived:
        diagnostics && typeof diagnostics.projectQuestionsReceived === "number" ? diagnostics.projectQuestionsReceived : null,
      referenceImagesReceived:
        diagnostics && typeof diagnostics.referenceImagesReceived === "number" ? diagnostics.referenceImagesReceived : null
    };
  }

  async function resolveQuestionUnderstandingForBatch(input: {
    batchQuestions: SerializedVisualQuestion[];
    generalInstructions: string;
    batchNumber: number;
    totalBatches: number;
  }) {
    const normalizedBatchQuestions = projectQuestions.filter((question) =>
      input.batchQuestions.some((batchQuestion) => batchQuestion.id === question.id)
    );
    const { fingerprint, hash } = buildQuestionBankHash(normalizedBatchQuestions);
    const cachedUnderstanding = getCachedQuestionUnderstanding(hash);

    if (cachedUnderstanding) {
      pushVisualLog("QUESTION_BATCH_CACHE_HIT", {
        batch: input.batchNumber,
        totalBatches: input.totalBatches,
        questionCount: cachedUnderstanding.length
      });
      setQuestionUnderstanding((current) => {
        const merged = [...current.filter((item) => !cachedUnderstanding.some((cached) => cached.questionId === item.questionId)), ...cachedUnderstanding];
        return merged.sort((left, right) => left.questionId - right.questionId);
      });
      setQuestionUnderstandingFingerprint(fingerprint);
      return cachedUnderstanding;
    }

    const questionBankPayload = {
      projectQuestions: input.batchQuestions,
      generalInstructions: input.generalInstructions
    };
    const payloadSizeBytes = estimateUtf8Bytes(JSON.stringify(questionBankPayload));
    const questionBankStageStartedAt = Date.now();
    pushVisualLog("VISUAL_PIPELINE_STAGE_START", {
      stage: `analyze-question-bank batch ${input.batchNumber}`,
      batchNumber: input.batchNumber,
      totalBatches: input.totalBatches,
      questionIds: input.batchQuestions.map((question) => question.id),
      questionCount: input.batchQuestions.length,
      timestamp: new Date().toISOString()
    });

    const questionBankResult = await fetchVisualStage<{ questionUnderstanding: VisualQuestionUnderstanding[] }>({
      endpoint: "/api/new-audit/analyze-question-bank",
      payload: questionBankPayload,
      payloadSizeBytes,
      photoCount: 0,
      questionCount: input.batchQuestions.length,
      timeoutMessage: `El batch ${input.batchNumber}/${input.totalBatches} del banco de preguntas excedio el timeout.`
    });
    pushVisualLog("VISUAL_PIPELINE_STAGE_END", {
      stage: `analyze-question-bank batch ${input.batchNumber}`,
      batchNumber: input.batchNumber,
      totalBatches: input.totalBatches,
      durationMs: Date.now() - questionBankStageStartedAt,
      status: questionBankResult.response.status,
      questionIds: input.batchQuestions.map((question) => question.id),
      questionCount: input.batchQuestions.length,
      timestamp: new Date().toISOString()
    });

    const resolvedUnderstanding = questionBankResult.parsed.questionUnderstanding ?? [];
    saveCachedQuestionUnderstanding(hash, resolvedUnderstanding);
    setQuestionUnderstanding((current) => {
      const merged = [...current.filter((item) => !resolvedUnderstanding.some((resolved) => resolved.questionId === item.questionId)), ...resolvedUnderstanding];
      return merged.sort((left, right) => left.questionId - right.questionId);
    });
    setQuestionUnderstandingFingerprint(fingerprint);
    return resolvedUnderstanding;
  }

  async function executeVisualAnswerBatch(input: {
    batchQuestions: SerializedVisualQuestion[];
    batchNumber: number;
    totalBatches: number;
    questionUnderstanding: VisualQuestionUnderstanding[];
    workingQuestions: ProjectQuestion[];
    workingKnowledgeBase: KnowledgeBase;
    storePhotos: ReturnType<typeof buildStorePhotosForVisualAnalysis>;
    initialPerPhotoAnalysis: PerPhotoAnalysis[];
    generalInstructions: string;
    previousQuestionStateById: Map<number, ProjectQuestion>;
  }): Promise<{
    workingQuestions: ProjectQuestion[];
    workingKnowledgeBase: KnowledgeBase;
    status: VisualBatchStatus;
    error: ErrorDetails | null;
    receivedQuestionIds: number[];
    missingQuestionIds: number[];
    questionIds: number[];
  }> {
    const questionIds = input.batchQuestions.map((question) => question.id);
    const preparedQuestionUnderstanding = input.questionUnderstanding.filter((question) =>
      questionIds.includes(question.questionId)
    );

    const answerPayload = {
      questionUnderstanding: preparedQuestionUnderstanding,
      storePhotos: input.storePhotos,
      knowledgeBase: input.workingKnowledgeBase,
      perPhotoAnalysis: input.initialPerPhotoAnalysis,
      generalInstructions: input.generalInstructions
    };
    pushVisualLog("PHASE_C_INPUT_IDS", {
      activeQuestionIds: questionIds,
      questionUnderstandingIds: input.questionUnderstanding.map((question) => question.questionId),
      previousResultIds: input.workingQuestions
        .filter(
          (question) =>
            questionIds.includes(question.id) &&
            (question.status === "answered" || question.status === "needs_review") &&
            question.suggestedAnswer &&
            question.suggestedAnswer !== "PENDIENTE_ANALISIS_VISUAL"
        )
        .map((question) => question.id),
      answerPayloadQuestionIds: preparedQuestionUnderstanding.map((question) => question.questionId),
      batchNumber: input.batchNumber,
      totalBatches: input.totalBatches
    });
    const payloadSizeBytes = estimateUtf8Bytes(JSON.stringify(answerPayload));
    if (payloadSizeBytes > MAX_VISUAL_PAYLOAD_BYTES) {
      throw new Error("El payload visual es demasiado grande. Reduce fotos o usa URLs en lugar de base64.");
    }
    const answerStageStartedAt = Date.now();
    pushVisualLog("VISUAL_PIPELINE_STAGE_START", {
      stage: `answer-questions batch ${input.batchNumber}`,
      batchNumber: input.batchNumber,
      totalBatches: input.totalBatches,
      questionIds,
      questionCount: questionIds.length,
      timestamp: new Date().toISOString()
    });

    const answerResult = await fetchVisualStage<{
      questionResults: Array<{
        questionId: number;
        questionText?: string;
        answer: string;
        confidence: number;
        reasoning: string;
        storePhotosUsed: number[];
        evidence: string[];
        visualDiagnostic: {
          whatTheQuestionAsks: string;
          requiredEvidence: string[];
          evidenceFound: string[];
          evidenceMissing: string[];
          visualComparisonWithReference: string;
          decisionRuleApplied: string;
        };
        status: "answered" | "needs_review";
      }>;
    }>({
      endpoint: "/api/new-audit/answer-questions",
      payload: answerPayload,
      payloadSizeBytes,
      photoCount: input.storePhotos.length,
      questionCount: preparedQuestionUnderstanding.length,
      timeoutMessage: `El batch ${input.batchNumber}/${input.totalBatches} excedio el timeout del servidor.`
    });
    pushVisualLog("VISUAL_PIPELINE_STAGE_END", {
      stage: `answer-questions batch ${input.batchNumber}`,
      batchNumber: input.batchNumber,
      totalBatches: input.totalBatches,
      durationMs: Date.now() - answerStageStartedAt,
      status: answerResult.response.status,
      questionIds,
      questionCount: questionIds.length,
      timestamp: new Date().toISOString()
    });

    const receivedQuestionIds = answerResult.parsed.questionResults.map((item) => item.questionId);
    const receivedQuestionIdSet = new Set(receivedQuestionIds);
    const missingQuestionIds = questionIds.filter((id) => !receivedQuestionIdSet.has(id));
    const resultsByQuestionId = new Map(answerResult.parsed.questionResults.map((item) => [item.questionId, item]));

    const updatedQuestions = input.workingQuestions.map((question) => {
      if (!questionIds.includes(question.id)) {
        return question;
      }

      const result = resultsByQuestionId.get(question.id);
      if (!result) {
        return input.previousQuestionStateById.get(question.id) ?? question;
      }

      return {
        ...question,
        status: result.status,
        suggestedAnswer: result.answer,
        confidence: result.confidence,
        reasoning: result.reasoning,
        storePhotosUsed: result.storePhotosUsed,
        evidence: result.evidence,
        visualDiagnostic: result.visualDiagnostic
      };
    });

    if (missingQuestionIds.length > 0) {
      const errorDetails = buildBatchIncompleteErrorDetails({
        batch: input.batchNumber,
        expectedQuestionIds: questionIds,
        receivedQuestionIds,
        missingQuestionIds,
        endpoint: "/api/new-audit/answer-questions"
      });

      return {
        workingQuestions: updatedQuestions,
        workingKnowledgeBase: buildMergedKnowledgeBase(input.workingKnowledgeBase, updatedQuestions),
        status: "partial_failed",
        error: errorDetails,
        receivedQuestionIds,
        missingQuestionIds,
        questionIds
      };
    }

    return {
      workingQuestions: updatedQuestions,
      workingKnowledgeBase: buildMergedKnowledgeBase(input.workingKnowledgeBase, updatedQuestions),
      status: "completed",
      error: null,
      receivedQuestionIds,
      missingQuestionIds,
      questionIds
    };
  }

  async function runQuestionBatchPipeline(input: {
    serializedQuestions: SerializedVisualQuestion[];
    storePhotos: ReturnType<typeof buildStorePhotosForVisualAnalysis>;
    initialKnowledgeBase: KnowledgeBase;
    initialPerPhotoAnalysis: PerPhotoAnalysis[];
    startBatchIndex: number;
    questionUnderstanding: VisualQuestionUnderstanding[];
    initialWorkingQuestions: ProjectQuestion[];
    initialBatchStates: VisualBatchState[];
  }) {
    const workingQuestions = [...input.initialWorkingQuestions];
    let workingKnowledgeBase = { ...input.initialKnowledgeBase };
    const batchSize = chooseQuestionBatchSize({
      questionCount: input.serializedQuestions.length,
      photoCount: input.storePhotos.length,
      generalInstructions
    });
    const chunks = splitIntoChunks(input.serializedQuestions, batchSize);
    let nextBatchStates = input.initialBatchStates.map((batch) => ({ ...batch }));

    setVisualPipelineState((current) => ({
      ...current,
      batchStates: nextBatchStates,
      phaseCAnswers: current.phaseBStoreAnalysis === "completed" ? "running" : current.phaseCAnswers
    }));

    for (let batchIndex = input.startBatchIndex; batchIndex < chunks.length; batchIndex += 1) {
      const batchQuestions = chunks[batchIndex] ?? [];
      const questionIds = batchQuestions.map((question) => question.id);

      nextBatchStates = nextBatchStates.map((batch) =>
        batch.batchNumber === batchIndex + 1 ? { ...batch, status: "running", error: null } : batch
      );
      setVisualPipelineState((current) => ({
        ...current,
        batchStates: nextBatchStates
      }));
      setVisualAnalysisMessage(`Batch ${batchIndex + 1}/${chunks.length} running`);
      setProjectQuestions((current) =>
        current.map((question) =>
          questionIds.includes(question.id)
            ? {
                ...question,
                status: "analyzing"
              }
            : question
        )
      );
      pushVisualLog("QUESTION_BATCH_STARTED", {
        batch: batchIndex + 1,
        totalBatches: chunks.length,
        questionIds
      });

      try {
        const previousQuestionStateById = new Map(
          workingQuestions
            .filter((question) => questionIds.includes(question.id))
            .map((question) => [question.id, { ...question }])
        );
        const batchOutcome = await executeVisualAnswerBatch({
          batchQuestions,
          batchNumber: batchIndex + 1,
          totalBatches: chunks.length,
          questionUnderstanding: input.questionUnderstanding,
          workingQuestions,
          workingKnowledgeBase,
          storePhotos: input.storePhotos,
          initialPerPhotoAnalysis: input.initialPerPhotoAnalysis,
          generalInstructions,
          previousQuestionStateById
        });

        workingQuestions.splice(0, workingQuestions.length, ...batchOutcome.workingQuestions);
        workingKnowledgeBase = batchOutcome.workingKnowledgeBase;
        setKnowledgeBase(workingKnowledgeBase);
        setProjectQuestions([...workingQuestions]);
        nextBatchStates = nextBatchStates.map((batch) =>
          batch.batchNumber === batchIndex + 1
            ? { ...batch, status: batchOutcome.status, error: batchOutcome.error }
            : batch
        );
        setVisualPipelineState((current) => ({
          ...current,
          phaseCAnswers: "running",
          batchStates: nextBatchStates
        }));
        pushVisualLog(
          batchOutcome.status === "completed" ? "QUESTION_BATCH_COMPLETED" : "QUESTION_BATCH_FAILED",
          {
            batch: batchIndex + 1,
            totalBatches: chunks.length,
            questionIds,
            expectedQuestionIds: questionIds,
            receivedQuestionIds: batchOutcome.receivedQuestionIds,
            missingQuestionIds: batchOutcome.missingQuestionIds,
            error: batchOutcome.error?.message ?? null
          }
        );
        if (batchOutcome.status !== "completed") {
          setPreviewError(batchOutcome.error);
          setVisualPipelineState((current) => {
            const finalState = buildVisualPipelineV2State(workingQuestions, nextBatchStates);
            return {
              ...current,
              ...finalState,
              phaseCAnswers: "failed"
            };
          });
          setVisualAnalysisMessage(
            `Batch ${batchIndex + 1}/${chunks.length} incompleto: faltan ${batchOutcome.missingQuestionIds.join(", ")}`
          );
          return {
            workingQuestions,
            batchStates: nextBatchStates,
            batchFailures: buildVisualPipelineV2State(workingQuestions, nextBatchStates).batchFailures
          };
        }
      } catch (error) {
        const errorDetails = buildBatchErrorDetails({
          error,
          endpoint: "/api/new-audit/answer-questions",
          batch: batchIndex + 1,
          questionIds
        });
        for (let index = 0; index < workingQuestions.length; index += 1) {
          const question = workingQuestions[index];
          if (!question || !questionIds.includes(question.id)) {
            continue;
          }

          workingQuestions[index] = {
            ...question,
            status: "needs_review",
            suggestedAnswer: "No puedo responder",
            confidence: 0.35,
            reasoning: "El analisis visual no pudo completarse para este batch.",
            storePhotosUsed: [],
            evidence: [errorDetails.message],
            visualDiagnostic: {
              whatTheQuestionAsks: question.text ?? "",
              requiredEvidence: [],
              evidenceFound: [],
              evidenceMissing: [errorDetails.message],
              visualComparisonWithReference: "No se pudo ejecutar la comparacion visual para este batch.",
              decisionRuleApplied: "Se marco needs_review por error de batch."
            }
          };
        }
        nextBatchStates = nextBatchStates.map((batch) =>
          batch.batchNumber === batchIndex + 1 ? { ...batch, status: "failed", error: errorDetails } : batch
        );
        setPreviewError(errorDetails);
        setProjectQuestions([...workingQuestions]);
        setVisualPipelineState((current) => {
          const finalState = buildVisualPipelineV2State(workingQuestions, nextBatchStates);
          return {
            ...current,
            ...finalState,
            phaseCAnswers: "failed"
          };
        });
        pushVisualLog("QUESTION_BATCH_FAILED", {
          batch: batchIndex + 1,
          totalBatches: chunks.length,
          questionIds,
          error: errorDetails.message
        });
        setVisualAnalysisMessage(`Batch ${batchIndex + 1}/${chunks.length} failed`);
        return {
          workingQuestions,
          batchStates: nextBatchStates,
          batchFailures: buildVisualPipelineV2State(workingQuestions, nextBatchStates).batchFailures
        };
      }
    }

    const finalPipelineState = buildVisualPipelineV2State(workingQuestions, nextBatchStates);
    setVisualPipelineState(finalPipelineState);
    setKnowledgeBase((current) => ({
      ...current,
      crossQuestionInsights: finalPipelineState.batchFailures.length === 0 ? current.crossQuestionInsights ?? [] : current.crossQuestionInsights ?? []
    }));
    setVisualAnalysisMessage("Final Review completed");
    setProjectQuestions([...workingQuestions]);
    return {
      workingQuestions,
      batchStates: nextBatchStates,
      batchFailures: finalPipelineState.batchFailures
    };
  }

  async function handleRetryBatch(batchNumber: number) {
    const batchState = visualPipelineState.batchStates.find((batch) => batch.batchNumber === batchNumber);
    if (!batchState) {
      setPreviewError({ message: `No existe el batch ${batchNumber}.`, batch: batchNumber, questionIds: [] });
      return;
    }

    if (serializedQuestionsRef.current.length === 0 || storePhotosRef.current.length === 0) {
      setPreviewError({
        message: "No hay contexto visual guardado para reintentar el batch.",
        batch: batchNumber,
        questionIds: batchState.questionIds
      });
      return;
    }

    const missingQuestionIds =
      batchState.error?.missingQuestionIds?.length ? batchState.error.missingQuestionIds : batchState.questionIds;
    const retryQuestions = serializedQuestionsRef.current.filter((question) => missingQuestionIds.includes(question.id));

    if (retryQuestions.length === 0) {
      setPreviewError({
        message: "No hay preguntas faltantes para reintentar.",
        batch: batchNumber,
        questionIds: missingQuestionIds
      });
      return;
    }

    setVisualAnalyzing(true);
    setPreviewError(null);
    setVisualAnalysisMessage(`Reintentando batch ${batchNumber}/${visualPipelineState.batchStates.length}...`);
    try {
      const previousQuestionStateById = new Map(
        projectQuestions
          .filter((question) => missingQuestionIds.includes(question.id))
          .map((question) => [question.id, { ...question }])
      );
      setProjectQuestions((current) =>
        current.map((question) =>
          missingQuestionIds.includes(question.id)
            ? {
                ...question,
                status: "analyzing"
              }
            : question
        )
      );

      const retryOutcome = await executeVisualAnswerBatch({
        batchQuestions: retryQuestions,
        batchNumber,
        totalBatches: visualPipelineState.batchStates.length,
        questionUnderstanding,
        workingQuestions: [...projectQuestions],
        workingKnowledgeBase: knowledgeBase,
        storePhotos: storePhotosRef.current,
        initialPerPhotoAnalysis: perPhotoAnalysis,
        generalInstructions,
        previousQuestionStateById
      });

      setProjectQuestions([...retryOutcome.workingQuestions]);
      setKnowledgeBase(retryOutcome.workingKnowledgeBase);
      const nextBatchStates = visualPipelineState.batchStates.map((batch) =>
        batch.batchNumber === batchNumber ? { ...batch, status: retryOutcome.status, error: retryOutcome.error } : batch
      );
      setVisualPipelineState((current) => {
        const finalState = buildVisualPipelineV2State(retryOutcome.workingQuestions, nextBatchStates);
        return {
          ...current,
          ...finalState,
          phaseCAnswers: retryOutcome.status === "completed" ? "running" : "failed"
        };
      });
      setPreviewError(retryOutcome.error);
      setVisualAnalysisMessage(
        retryOutcome.status === "completed"
          ? `Batch ${batchNumber}/${visualPipelineState.batchStates.length} completado`
          : `Batch ${batchNumber}/${visualPipelineState.batchStates.length} incompleto: faltan ${retryOutcome.missingQuestionIds.join(", ")}`
      );
    } finally {
      setVisualAnalyzing(false);
    }
  }

  function handleAnalyzeVisualMouseDown(source: string) {
    registerVisualAnalyzeInteraction("MOUSEDOWN_ANALIZAR_VISUAL_RECIBIDO", source);
  }

  async function handleAnalyzeVisually(source = "unknown") {
    registerVisualAnalyzeInteraction("CLICK_ANALIZAR_VISUAL_RECIBIDO", source);
    setVisualAnalysisMessage("Iniciando analisis visual...");
      setVisualAnalyzing(true);
    setVisualAnalysisMessage("Analizando visualmente...");
    setPreviewError(null);
    setVisualAnalysisLogs([]);
    setVisualPipelineState(createEmptyVisualPipelineV2State());
    setPerPhotoAnalysis([]);
    setKnowledgeBase(buildEmptyKnowledgeBase());
    setQuestionUnderstanding([]);
    setQuestionUnderstandingFingerprint(null);
    pushVisualLog("iniciando análisis visual", { source });
    let analyzeStatus: number | null = null;
    let analyzeBody: unknown = null;
    let analyzeRawText = "";
    let payloadSizeBytes = 0;

    try {
      const cleanedProjectQuestions = projectQuestions.map((question) =>
        activeProjectQuestions.some((item) => item.id === question.id) ? resetQuestionVisualResult(question) : question
      );
      setProjectQuestions(cleanedProjectQuestions);

      const serializedQuestions = await normalizeVisualReferencesForAnalysis(
        activeProjectQuestions,
        referenceImageSessionsRef.current,
        pushVisualLog
      );
      serializedQuestionsRef.current = serializedQuestions;
      const storePhotos = buildStorePhotosForVisualAnalysis();
      storePhotosRef.current = storePhotos;
      const initialBatchStates = buildVisualBatchStatesForV2(serializedQuestions, 2);
      let workingQuestions = [...cleanedProjectQuestions];
      let workingKnowledgeBase = buildEmptyKnowledgeBase();
      let nextBatchStates = initialBatchStates.map((batch) => ({ ...batch }));

      setVisualPipelineState({
        phaseAQuestionBank: "pending",
        phaseBStoreAnalysis: "pending",
        phaseCAnswers: "pending",
        batchStates: initialBatchStates,
        answeredCount: 0,
        needsReviewCount: 0,
        pendingCount: serializedQuestions.length,
        photosUsedCount: 0,
        batchFailures: []
      });

      const pipelineResult = await runVisualAuditV2({
        activeQuestions: serializedQuestions,
        storePhotos,
        generalInstructions,
        answerBatchSize: 2,
        phaseAMaxAttempts: 3,
        callbacks: {
          onLog: (entry) => {
            pushVisualLog(entry.message, entry.detail);
          },
          onRequestMeta: (meta) => {
            payloadSizeBytes = meta.payloadSizeBytes;
            analyzeStatus = meta.status;
            analyzeRawText = meta.rawText;
            setLastVisualRequestMeta(meta);
          },
          onPhaseACompleted: (phaseAResult) => {
            setQuestionUnderstanding(phaseAResult.questionUnderstanding);
            setVisualPipelineState((current) => ({
              ...current,
              phaseAQuestionBank: "completed"
            }));
          },
          onPhaseBCompleted: (phaseBResult) => {
            workingKnowledgeBase = {
              ...phaseBResult.knowledgeBase,
              crossQuestionInsights: []
            };
            setPerPhotoAnalysis(phaseBResult.perPhotoAnalysis as PerPhotoAnalysis[]);
            setKnowledgeBase(workingKnowledgeBase);
            setVisualPipelineState((current) => ({
              ...current,
              phaseAQuestionBank: "completed",
              phaseBStoreAnalysis: "completed",
              phaseCAnswers: "pending"
            }));
            setVisualAnalysisMessage("Fase B completada.");
          },
          onPhaseCBatchStarted: (batchState) => {
            nextBatchStates = nextBatchStates.map((batch) =>
              batch.batchNumber === batchState.batchNumber
                ? mapVisualPipelineV2BatchState(batchState)
                : batch
            );
            setVisualPipelineState((current) => ({
              ...current,
              phaseAQuestionBank: "completed",
              phaseBStoreAnalysis: "completed",
              phaseCAnswers: "running",
              batchStates: nextBatchStates
            }));
            setProjectQuestions((current) =>
              current.map((question) =>
                batchState.questionIds.includes(question.id)
                  ? {
                      ...question,
                      status: "analyzing"
                    }
                  : question
              )
            );
            setVisualAnalysisMessage(`Batch ${batchState.batchNumber}/${batchState.totalBatches} running`);
          },
          onPhaseCBatchCompleted: ({ batchState, questionResults }) => {
            workingQuestions = applyQuestionResultsToQuestions(workingQuestions, questionResults);
            workingKnowledgeBase = buildMergedKnowledgeBase(workingKnowledgeBase, workingQuestions);
            nextBatchStates = nextBatchStates.map((batch) =>
              batch.batchNumber === batchState.batchNumber
                ? mapVisualPipelineV2BatchState(batchState)
                : batch
            );
            setProjectQuestions([...workingQuestions]);
            setKnowledgeBase(workingKnowledgeBase);
            setVisualPipelineState({
              ...buildVisualPipelineV2State(workingQuestions, nextBatchStates),
              phaseAQuestionBank: "completed",
              phaseBStoreAnalysis: "completed",
              phaseCAnswers: "running"
            });
            setVisualAnalysisMessage(`Batch ${batchState.batchNumber}/${batchState.totalBatches} completado`);
          },
          onPhaseCBatchFailed: ({ batchState, questionResults, missingQuestionIds, message }) => {
            workingQuestions = applyQuestionResultsToQuestions(workingQuestions, questionResults);
            workingKnowledgeBase = buildMergedKnowledgeBase(workingKnowledgeBase, workingQuestions);
            nextBatchStates = nextBatchStates.map((batch) =>
              batch.batchNumber === batchState.batchNumber
                ? mapVisualPipelineV2BatchState(batchState, {
                    message,
                    batch: batchState.batchNumber,
                    questionIds: batchState.questionIds,
                    expectedQuestionIds: batchState.questionIds,
                    receivedQuestionIds: questionResults.map((question) => question.questionId),
                    missingQuestionIds
                  })
                : batch
            );
            setProjectQuestions([...workingQuestions]);
            setKnowledgeBase(workingKnowledgeBase);
            setVisualPipelineState({
              ...buildVisualPipelineV2State(workingQuestions, nextBatchStates),
              phaseAQuestionBank: "completed",
              phaseBStoreAnalysis: "completed",
              phaseCAnswers: "failed"
            });
            setVisualAnalysisMessage(`Batch ${batchState.batchNumber}/${batchState.totalBatches} failed`);
          }
        }
      });

      workingQuestions = applyQuestionResultsToQuestions(cleanedProjectQuestions, pipelineResult.questionResults);
      workingKnowledgeBase = buildMergedKnowledgeBase(
        {
          ...pipelineResult.knowledgeBase,
          crossQuestionInsights: []
        },
        workingQuestions
      );
      nextBatchStates = pipelineResult.batchStates.map((batchState) => mapVisualPipelineV2BatchState(batchState));
      setQuestionUnderstanding(pipelineResult.questionUnderstanding);
      setPerPhotoAnalysis(pipelineResult.perPhotoAnalysis as PerPhotoAnalysis[]);
      setKnowledgeBase(workingKnowledgeBase);
      setProjectQuestions(workingQuestions);
      setVisualPipelineState({
        ...buildVisualPipelineV2State(workingQuestions, nextBatchStates),
        phaseAQuestionBank: "completed",
        phaseBStoreAnalysis: "completed",
        phaseCAnswers: "completed"
      });
      setVisualAnalysisMessage("PIPELINE_V2_COMPLETED");
    } catch (error) {
      const errorCode = error instanceof VisualPipelineV2Error ? error.code : null;
      const errorDetail = error instanceof VisualPipelineV2Error ? error.detail : {};
      const message = error instanceof Error ? error.message : String(error);
      analyzeStatus = errorDetail.status ?? analyzeStatus;
      analyzeBody = errorDetail.body ?? analyzeBody;
      analyzeRawText = errorDetail.rawText ?? analyzeRawText;
      const errorDetails: ErrorDetails = {
        message,
        endpoint: errorDetail.endpoint ?? null,
        status: analyzeStatus,
        body: analyzeBody,
        stack: error instanceof Error ? error.stack ?? null : null,
        batch:
          errorDetail.partialResult?.batchStates.find((batch) => batch.status === "failed")?.batchNumber ?? null,
        questionIds:
          errorDetail.expectedQuestionIds ?? activeProjectQuestions.map((question) => question.id),
        expectedQuestionIds: errorDetail.expectedQuestionIds,
        receivedQuestionIds: errorDetail.receivedQuestionIds,
        missingQuestionIds: errorDetail.missingQuestionIds
      };
      setPreviewError(errorDetails);
      if (error instanceof VisualPipelineV2Error && error.detail.partialResult) {
        const partialQuestions = applyQuestionResultsToQuestions(
          projectQuestions.map((question) =>
            activeProjectQuestions.some((item) => item.id === question.id) ? resetQuestionVisualResult(question) : question
          ),
          error.detail.partialResult.questionResults
        );
        const partialBatchStates = error.detail.partialResult.batchStates.map((batchState) =>
          mapVisualPipelineV2BatchState(batchState, batchState.errorMessage ? { message: batchState.errorMessage } : null)
        );
        const partialKnowledgeBase = error.detail.partialResult.knowledgeBase
          ? buildMergedKnowledgeBase(
              {
                ...error.detail.partialResult.knowledgeBase,
                crossQuestionInsights: []
              },
              partialQuestions
            )
          : buildEmptyKnowledgeBase();
        setQuestionUnderstanding(error.detail.partialResult.questionUnderstanding);
        setPerPhotoAnalysis(error.detail.partialResult.perPhotoAnalysis as PerPhotoAnalysis[]);
        setKnowledgeBase(partialKnowledgeBase);
        setProjectQuestions(partialQuestions);
        setVisualPipelineState({
          ...buildVisualPipelineV2State(partialQuestions, partialBatchStates),
          phaseAQuestionBank:
            errorCode === "PHASE_A_FAILED"
              ? "failed"
              : "completed",
          phaseBStoreAnalysis:
            errorCode === "PHASE_A_FAILED" ? "pending" : errorCode === "PHASE_B_FAILED" ? "failed" : "completed",
          phaseCAnswers:
            errorCode === "PHASE_C_FAILED"
              ? "failed"
              : errorCode === "PHASE_A_FAILED" || errorCode === "PHASE_B_FAILED"
                ? "pending"
                : "failed"
        });
      } else {
        setVisualPipelineState((current) => ({
          ...current,
          phaseCAnswers: "failed"
        }));
      }
      pushVisualLog("error", {
        endpoint: errorDetails.endpoint,
        status: analyzeStatus,
        body: analyzeBody,
        rawText: analyzeRawText,
        payloadSizeBytes,
        message,
        stack: error instanceof Error ? error.stack ?? null : null,
        batch: errorDetails.batch,
        questionIds: errorDetails.questionIds
      });
      setVisualAnalysisMessage(message);
    } finally {
      setVisualAnalyzing(false);
    }
  }

  async function handleAnswerSurveyUntilPhoto(source = "unknown") {
    pushVisualLog("SURVEY_ANSWERING_STARTED", { source });
    pushVisualLog("LIVE_RUN_STARTED", { source, mode: "single_question_live" });

    if (!canAnswerSurveyUntilPhoto) {
      setPreviewError({ message: "Primero debes tener questionResults calculadas para las preguntas activas." });
      setVisualAnalysisMessage("Faltan questionResults para responder la encuesta.");
      pushVisualLog("LIVE_RUN_FAILED", {
        source,
        reason: "question_results_missing"
      });
      return;
    }

    const firstStore = stores[0];
    if (!firstStore) {
      setPreviewError({ message: "Debes ingresar al menos un Store Code." });
      return;
    }

    setSurveyAnswering(true);
    setPreviewError(null);
    setVisualAnalysisMessage("Respondiendo siguiente pregunta...");

    try {
      const isNewStepperSession = !activeRun?.stepperSessionId;
      if (isNewStepperSession) {
        pushVisualLog("PAGE_NAVIGATION_STARTED", {
          surveyUrl,
          storeCode: currentStore !== "Sin datos reales todavia" ? currentStore : firstStore
        });
      }

      pushVisualLog("RESPOND_NEXT_QUESTION_RUN_ID", {
        runId,
        activeRunId: activeRun?.id ?? null
      });
      pushVisualLog("RUN_ID_IS_VALID_UUID", {
        runId,
        valid: Boolean(runId && isValidUuid(runId))
      });

      const response = await fetch("/api/new-audit/respond-next-question", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          runId: runId ?? "",
          surveyUrl,
          storeCode: currentStore !== "Sin datos reales todavia" ? currentStore : firstStore,
          validatorCode,
          questionResults: activeProjectQuestions.map((question) => ({
            id: question.id,
            physicalNumber: question.physicalNumber,
            text: question.text,
            referenceImageUrl: question.referenceImageUrl,
            expectedOptions: question.expectedOptions,
            status: question.status,
            suggestedAnswer: question.suggestedAnswer
          })),
          needsReviewBehavior: "stop",
          stepperSessionId: activeRun?.stepperSessionId ?? ""
        })
      });

      const payload = (await response.json()) as
        | { mode?: "real"; payload?: DirectPreviewPayload; error?: string; endpoint?: string | null; status?: number; body?: unknown; rawText?: string | null }
        | null;

      pushVisualLog("STEPPER_ENDPOINT_RESPONSE", {
        endpoint: "/api/new-audit/respond-next-question",
        status: response.status,
        ok: response.ok,
        rawText: payload && "rawText" in payload ? payload.rawText ?? null : null
      });

      const routeBody =
        payload && "body" in payload && payload.body && typeof payload.body === "object"
          ? (payload.body as { actionLogs?: Array<{ event?: string; detail?: unknown }> })
          : null;
      relayLiveRunActionLogs(routeBody?.actionLogs);

      if (!response.ok || !payload || !("payload" in payload) || !payload.payload) {
        if (routeBody && "error" in routeBody) {
          pushVisualLog("STEPPER_SESSION_LOOKUP_RESULT", routeBody);
        }
        pushVisualLog("LIVE_RUN_FAILED", {
          source,
          endpoint: "/api/new-audit/respond-next-question",
          status: response.status,
          error: payload && "error" in payload && payload.error ? payload.error : "respond_next_question_failed"
        });
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "respond_next_question_failed");
      }

      const responsePayload = payload.payload;

      const fallbackRun = buildFallbackRun(
        responsePayload,
        currentStore !== "Sin datos reales todavia" ? currentStore : firstStore,
        surveyUrl,
        validatorCode
      );
      setActiveRun((current) => ({
        ...fallbackRun,
        currentStep: responsePayload.currentStep ?? responsePayload.finalState ?? fallbackRun.currentStep,
        probableQuestionText:
          responsePayload.currentQuestion?.probableQuestionText ??
          responsePayload.probableQuestionText ??
          fallbackRun.probableQuestionText,
        projectQuestions: current?.projectQuestions?.length ? current.projectQuestions : projectQuestions,
        generalInstructions,
        currentQuestion: responsePayload.currentQuestion ?? fallbackRun.currentQuestion ?? null,
        stepperSessionId: responsePayload.stepperSessionId ?? fallbackRun.stepperSessionId ?? null,
        traceability: responsePayload.traceability ?? fallbackRun.traceability ?? null,
        finalState: responsePayload.finalState ?? fallbackRun.finalState ?? null
      }));

      relayLiveRunActionLogs(responsePayload.actionLogs, {
        includeNavigationCompleted: isNewStepperSession
      });
      if (responsePayload.currentQuestion) {
        pushVisualLog("extractCurrentSurveyQuestion", responsePayload.currentQuestion);
      }

      setWorkspaceStatus(
        ["WAITING_FOR_CONTINUE", "STEPPER_READY", "WAITING_FOR_PHOTO_SELECTION"].includes(responsePayload.finalState ?? "")
          ? "Ready"
          : "Failed"
      );
      setVisualAnalysisMessage(
        responsePayload.finalState === "WAITING_FOR_CONTINUE"
          ? "Pregunta respondida. Lista para continuar."
          : responsePayload.finalState === "WAITING_FOR_PHOTO_SELECTION"
            ? "WAITING_FOR_PHOTO_SELECTION"
            : responsePayload.finalState ?? "La encuesta requiere revisión."
      );
      setPreviewError(
        ["WAITING_FOR_CONTINUE", "STEPPER_READY", "WAITING_FOR_PHOTO_SELECTION"].includes(responsePayload.finalState ?? "")
          ? null
          : {
              message: responsePayload.finalState ?? "answer_survey_until_photo_failed",
              endpoint: "/api/new-audit/respond-next-question",
              status: response.status,
              body: responsePayload
            }
      );

      if (!["WAITING_FOR_CONTINUE", "STEPPER_READY", "WAITING_FOR_PHOTO_SELECTION"].includes(responsePayload.finalState ?? "")) {
        pushVisualLog("LIVE_RUN_FAILED", {
          source,
          finalState: responsePayload.finalState ?? null
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("No se encontró el botón CONTINUAR")) {
        pushVisualLog("NEXT_BUTTON_NOT_FOUND", { source, error: errorMessage });
      }
      pushVisualLog("LIVE_RUN_FAILED", {
        source,
        error: errorMessage
      });
      setWorkspaceStatus("Failed");
      setPreviewError({
        message: errorMessage,
        endpoint: "/api/new-audit/respond-next-question"
      });
      setVisualAnalysisMessage("No se pudo responder la siguiente pregunta.");
    } finally {
      setSurveyAnswering(false);
    }
  }

  async function handleContinueNextQuestion(source = "unknown") {
    pushVisualLog("CONTINUE_CLICKED", { source, mode: "stepper" });

    if (!activeRun?.stepperSessionId) {
      setPreviewError({ message: "No hay una sesion stepper activa." });
      return;
    }

    setSurveyContinuing(true);
    setPreviewError(null);
    setVisualAnalysisMessage("Continuando a la siguiente pregunta...");

    try {
      const response = await fetch("/api/new-audit/continue-next-question", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stepperSessionId: activeRun.stepperSessionId
        })
      });

      const payload = (await response.json()) as
        | { mode?: "real"; payload?: DirectPreviewPayload; error?: string; endpoint?: string | null; status?: number; body?: unknown }
        | null;

      if (!response.ok || !payload || !("payload" in payload) || !payload.payload) {
        pushVisualLog("LIVE_RUN_FAILED", {
          source,
          endpoint: "/api/new-audit/continue-next-question",
          status: response.status,
          error: payload && "error" in payload && payload.error ? payload.error : "continue_next_question_failed"
        });
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "continue_next_question_failed");
      }

      const responsePayload = payload.payload;
      const fallbackRun = buildFallbackRun(
        responsePayload,
        activeRun.storeCode,
        surveyUrl,
        validatorCode
      );

      setActiveRun((current) => ({
        ...fallbackRun,
        projectQuestions: current?.projectQuestions?.length ? current.projectQuestions : projectQuestions,
        generalInstructions,
        currentQuestion: responsePayload.currentQuestion ?? fallbackRun.currentQuestion ?? null,
        stepperSessionId: responsePayload.stepperSessionId ?? fallbackRun.stepperSessionId ?? null,
        traceability: responsePayload.traceability ?? fallbackRun.traceability ?? null,
        finalState: responsePayload.finalState ?? fallbackRun.finalState ?? null
      }));

      relayLiveRunActionLogs(responsePayload.actionLogs);

      setWorkspaceStatus(["STEPPER_READY", "WAITING_FOR_PHOTO_SELECTION"].includes(responsePayload.finalState ?? "") ? "Ready" : "Failed");
      setVisualAnalysisMessage(
        responsePayload.finalState === "STEPPER_READY"
          ? "Lista para responder la siguiente pregunta."
          : responsePayload.finalState === "WAITING_FOR_PHOTO_SELECTION"
            ? "WAITING_FOR_PHOTO_SELECTION"
            : responsePayload.finalState ?? "La encuesta requiere revisión."
      );
      setPreviewError(
        ["STEPPER_READY", "WAITING_FOR_PHOTO_SELECTION"].includes(responsePayload.finalState ?? "")
          ? null
          : {
              message: responsePayload.finalState ?? "continue_next_question_failed",
              endpoint: "/api/new-audit/continue-next-question",
              status: response.status,
              body: responsePayload
            }
      );

      if (["STEPPER_READY", "WAITING_FOR_PHOTO_SELECTION"].includes(responsePayload.finalState ?? "")) {
        pushVisualLog("LIVE_RUN_COMPLETED", {
          source,
          finalState: responsePayload.finalState ?? null
        });
      } else {
        pushVisualLog("LIVE_RUN_FAILED", {
          source,
          finalState: responsePayload.finalState ?? null
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("No se encontró el botón CONTINUAR")) {
        pushVisualLog("NEXT_BUTTON_NOT_FOUND", { source, error: errorMessage });
      }
      pushVisualLog("LIVE_RUN_FAILED", {
        source,
        error: errorMessage
      });
      setWorkspaceStatus("Failed");
      setPreviewError({
        message: errorMessage,
        endpoint: "/api/new-audit/continue-next-question"
      });
      setVisualAnalysisMessage("No se pudo continuar a la siguiente pregunta.");
    } finally {
      setSurveyContinuing(false);
    }
  }

  async function handleCompleteSurveyWithTraceability(source = "unknown") {
    pushVisualLog("SURVEY_ANSWERING_STARTED", { source, mode: "full_traceability" });

    if (!canCompleteSurveyWithTraceability) {
      setPreviewError({ message: "Primero debes tener questionResults calculadas para las preguntas activas." });
      setVisualAnalysisMessage("Faltan questionResults para completar la encuesta.");
      return;
    }

    const firstStore = stores[0];
    if (!firstStore) {
      setPreviewError({ message: "Debes ingresar al menos un Store Code." });
      return;
    }

    setSurveyCompleting(true);
    setPreviewError(null);
    setVisualAnalysisMessage("Completando encuesta con trazabilidad total...");

    try {
      const response = await fetch("/api/new-audit/complete-survey-trace", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          surveyUrl,
          storeCode: currentStore !== "Sin datos reales todavia" ? currentStore : firstStore,
          validatorCode,
          questionResults: activeProjectQuestions.map((question) => ({
            id: question.id,
            physicalNumber: question.physicalNumber,
            text: question.text,
            referenceImageUrl: question.referenceImageUrl,
            expectedOptions: question.expectedOptions,
            status: question.status,
            suggestedAnswer: question.suggestedAnswer,
            storePhotosUsed: question.storePhotosUsed
          })),
          needsReviewBehavior: "stop"
        })
      });

      const payload = (await response.json()) as
        | { mode?: "real"; payload?: DirectPreviewPayload; error?: string; endpoint?: string | null; status?: number; body?: unknown }
        | null;

      if (!response.ok || !payload || !("payload" in payload) || !payload.payload) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "complete_survey_trace_failed");
      }

      const responsePayload = payload.payload;
      const fallbackRun = buildFallbackRun(
        responsePayload,
        currentStore !== "Sin datos reales todavia" ? currentStore : firstStore,
        surveyUrl,
        validatorCode
      );

      setActiveRun((current) => ({
        ...fallbackRun,
        currentStep: responsePayload.currentStep ?? fallbackRun.currentStep,
        probableQuestionText: responsePayload.probableQuestionText ?? fallbackRun.probableQuestionText,
        projectQuestions: current?.projectQuestions?.length ? current.projectQuestions : projectQuestions,
        generalInstructions,
        traceability: responsePayload.traceability ?? fallbackRun.traceability ?? null,
        surveyCompletionNumber: responsePayload.surveyCompletionNumber ?? fallbackRun.surveyCompletionNumber ?? null,
        finalState: responsePayload.finalState ?? fallbackRun.finalState ?? null,
        preparedSessionId: responsePayload.preparedSessionId ?? fallbackRun.preparedSessionId ?? null
      }));

      if (Array.isArray(responsePayload.actionLogs)) {
        responsePayload.actionLogs.forEach((entry) => {
          pushVisualLog(entry.event, entry.detail);
        });
      }

      const auditable = responsePayload.traceability?.auditable ?? false;
      const waitingHuman = responsePayload.finalState === "WAITING_FOR_HUMAN_SUBMIT_CONFIRMATION";
      const completionNumber = responsePayload.surveyCompletionNumber ?? "sin detectar";
      setWorkspaceStatus(auditable ? "Ready" : "Failed");
      setVisualAnalysisMessage(
        auditable
          ? waitingHuman
            ? "Listo para enviar, pendiente de aprobación humana"
            : `SURVEY_FINISHED | Número: ${completionNumber}`
          : "Corrida finalizada con warnings de trazabilidad."
      );
      setPreviewError(
        auditable
          ? null
          : {
              message: "TRACEABILITY_WARNINGS_PRESENT",
              endpoint: "/api/new-audit/complete-survey-trace",
              status: response.status,
              body: responsePayload
            }
      );
    } catch (error) {
      setWorkspaceStatus("Failed");
      setPreviewError({
        message: error instanceof Error ? error.message : String(error),
        endpoint: "/api/new-audit/complete-survey-trace"
      });
      setVisualAnalysisMessage("La encuesta no pudo completarse con trazabilidad.");
    } finally {
      setSurveyCompleting(false);
    }
  }

  async function handleSubmitConfirmedSurvey(source = "unknown") {
    pushVisualLog("SURVEY_SUBMITTED", { source, mode: "human_confirmed_submit" });

    if (!activeRun?.preparedSessionId) {
      setPreviewError({ message: "No hay una sesión preparada para enviar." });
      return;
    }

    setSurveySubmitting(true);
    setPreviewError(null);
    setVisualAnalysisMessage("Enviando encuesta confirmada...");

    try {
      const response = await fetch("/api/new-audit/submit-confirmed-survey", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          preparedSessionId: activeRun.preparedSessionId
        })
      });

      const payload = (await response.json()) as
        | { mode?: "real"; payload?: DirectPreviewPayload; error?: string; endpoint?: string | null; status?: number; body?: unknown }
        | null;

      if (!response.ok || !payload || !("payload" in payload) || !payload.payload) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "submit_confirmed_survey_failed");
      }

      const responsePayload = payload.payload;
      const fallbackRun = buildFallbackRun(
        responsePayload,
        activeRun.storeCode,
        surveyUrl,
        validatorCode
      );

      setActiveRun((current) => ({
        ...fallbackRun,
        currentStep: responsePayload.currentStep ?? fallbackRun.currentStep,
        probableQuestionText: responsePayload.probableQuestionText ?? fallbackRun.probableQuestionText,
        projectQuestions: current?.projectQuestions?.length ? current.projectQuestions : projectQuestions,
        generalInstructions,
        traceability: responsePayload.traceability ?? fallbackRun.traceability ?? null,
        surveyCompletionNumber: responsePayload.surveyCompletionNumber ?? fallbackRun.surveyCompletionNumber ?? null,
        finalState: responsePayload.finalState ?? fallbackRun.finalState ?? null,
        preparedSessionId: null
      }));

      if (Array.isArray(responsePayload.actionLogs)) {
        responsePayload.actionLogs.forEach((entry) => {
          pushVisualLog(entry.event, entry.detail);
        });
      }

      setWorkspaceStatus(responsePayload.traceability?.auditable === false ? "Failed" : "Ready");
      setVisualAnalysisMessage(
        responsePayload.surveyCompletionNumber
          ? `SURVEY_FINISHED | Número: ${responsePayload.surveyCompletionNumber}`
          : "SURVEY_FINISHED"
      );
      setPreviewError(
        responsePayload.traceability?.auditable === false
          ? {
              message: "TRACEABILITY_WARNINGS_PRESENT",
              endpoint: "/api/new-audit/submit-confirmed-survey",
              status: response.status,
              body: responsePayload
            }
          : null
      );
    } catch (error) {
      setWorkspaceStatus("Failed");
      setPreviewError({
        message: error instanceof Error ? error.message : String(error),
        endpoint: "/api/new-audit/submit-confirmed-survey"
      });
      setVisualAnalysisMessage("No se pudo enviar la encuesta confirmada.");
    } finally {
      setSurveySubmitting(false);
    }
  }

  return (
    <section className="new-audit-cockpit">
      <aside className="audit-sidebar">
        <div className="audit-panel-head">
          <h2>Configuracion</h2>
        </div>

        <div className="audit-field">
          <label htmlFor="projectId">Proyecto</label>
          <select id="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="shave-care-gillette">Gillette Shave Care</option>
          </select>
        </div>

        <div className="audit-field">
          <label htmlFor="surveyUrl">Survey URL</label>
          <input id="surveyUrl" value={surveyUrl} onChange={(event) => setSurveyUrl(event.target.value)} />
        </div>

        <div className="audit-field">
          <label htmlFor="validatorCode">Validator Code</label>
          <input id="validatorCode" value={validatorCode} onChange={(event) => setValidatorCode(event.target.value)} />
        </div>

        <div className="audit-field">
          <label htmlFor="storeList">Store List</label>
          <textarea id="storeList" value={storeList} onChange={(event) => setStoreList(event.target.value)} />
        </div>

        <div className="audit-sidebar-actions">
          <button className="audit-primary-button" type="button" disabled={workspaceStatus === "Running"} onClick={handleStart}>
            {workspaceStatus === "Running" ? "Running..." : "Start"}
          </button>
          <button
            className="audit-secondary-button"
            type="button"
            disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting}
            onMouseDown={() => handleAnalyzeVisualMouseDown("sidebar")}
            onClick={() => void handleAnalyzeVisually("sidebar")}
          >
            Analizar visualmente
          </button>
          <button
            className="audit-secondary-button"
            type="button"
            disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canAnswerSurveyUntilPhoto}
            onClick={() => void handleAnswerSurveyUntilPhoto("sidebar")}
          >
            {surveyAnswering ? "Respondiendo..." : "Responder siguiente pregunta"}
          </button>
          <button
            className="audit-secondary-button"
            type="button"
            disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canContinueStepper}
            onClick={() => void handleContinueNextQuestion("sidebar")}
          >
            {surveyContinuing ? "Continuando..." : "Continuar a siguiente pregunta"}
          </button>
          <button
            className="audit-secondary-button"
            type="button"
            disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canCompleteSurveyWithTraceability}
            onClick={() => void handleCompleteSurveyWithTraceability("sidebar")}
          >
            {surveyCompleting ? "Completando..." : "Completar encuesta con trazabilidad"}
          </button>
          <button
            className="audit-secondary-button"
            type="button"
            disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canSubmitConfirmedSurvey}
            onClick={() => void handleSubmitConfirmedSurvey("sidebar")}
          >
            {surveySubmitting ? "Enviando..." : "Enviar encuesta confirmada"}
          </button>
          <button className="audit-secondary-button" type="button" disabled>
            Pause
          </button>
          <button className="audit-danger-button" type="button" onClick={handleStop}>
            Stop
          </button>
        </div>

        <div className="audit-sidebar-status">
          <div className="audit-sidebar-line">
            <span>Estado</span>
            <strong>{workspaceStatus}</strong>
          </div>
          <div className="audit-sidebar-line">
            <span>Tienda actual</span>
            <strong>{currentStore}</strong>
          </div>
          <div className="audit-sidebar-line">
            <span>imageLinks</span>
            <strong>{imageLinks.length}</strong>
          </div>
          <div className="audit-sidebar-line">
            <span>radioCount</span>
            <strong>{activeRun?.radioCount ?? 0}</strong>
          </div>
          <div className="audit-sidebar-line">
            <span>finalBodyTextLength</span>
            <strong>{activeRun?.finalBodyTextLength ?? 0}</strong>
          </div>
          <div className="audit-sidebar-line">
            <span>Preguntas cargadas</span>
            <strong>{projectQuestions.length}</strong>
          </div>
          <div className="audit-sidebar-line">
            <span>Modo</span>
            <strong>{executionMode}</strong>
          </div>
        </div>
        {visualAnalysisMessage ? <div className="audit-info-banner">{visualAnalysisMessage}</div> : null}
      </aside>

      <div className="audit-main">
        <section className="audit-live-panel">
          <div className="audit-panel-head">
            <div className="audit-panel-title-row">
              <h2>Estado del flujo</h2>
              <span className="audit-step-badge">Paso actual: {activeRun?.currentStep ?? "sin datos reales"}</span>
            </div>
            <div className="audit-panel-meta">
              <span>Tienda actual: {currentStore}</span>
              <span className={`audit-status-pill state-${workspaceStatus.toLowerCase()}`}>{workspaceStatus}</span>
            </div>
          </div>

          <div className="audit-browser-shell">
            <div className="audit-browser-address">{activeRun?.finalUrl ?? surveyUrl}</div>
            <div className="audit-browser-stage">
              <div className="audit-empty-panel compact">
                <div>
                  <strong>{activeRun?.finalState ?? workspaceStatus}</strong>
                  <p>{activeRun?.probableQuestionText ?? "Sin pregunta visible todavía"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="audit-live-panel">
          <div className="audit-panel-head">
            <h2>Timeline de ejecucion</h2>
          </div>
          <div className="audit-timeline-list">
            {timelineItems.map((item) => (
              <article key={item.key} className={`audit-timeline-card state-${item.status}`}>
                <div className="audit-timeline-head">
                  <strong>{item.label}</strong>
                  <span className={`audit-status-pill state-${item.status}`}>{item.status}</span>
                </div>
                <span className="audit-timeline-time">{formatTimestamp(item.timestamp)}</span>
                <p>{item.message}</p>
                {item.questionNumber ? <p>Pregunta: {item.questionNumber}</p> : null}
                {item.selectedAnswer ? <p>Respuesta: {item.selectedAnswer}</p> : null}
                {item.selectorUsed ? <p>Selector usado: {item.selectorUsed}</p> : null}
                {item.error ? <p className="audit-error-text">Error: {item.error}</p> : null}
                {item.screenshotUrl ? (
                  <a className="audit-timeline-thumb" href={item.screenshotUrl} target="_blank" rel="noreferrer">
                    <img alt={item.label} src={item.screenshotUrl} />
                  </a>
                ) : null}
              </article>
            ))}
            {timelineItems.length ? null : <div className="audit-inline-empty">La timeline aparecera al iniciar la corrida.</div>}
          </div>
        </section>

        <section className="audit-live-panel">
          <div className="audit-panel-head">
            <h2>Timeline de capturas</h2>
          </div>
          <div className="audit-capture-groups">
            {Object.entries(screenshotGroups).length === 0 ? (
              <div className="audit-inline-empty">Sin capturas agrupadas todavia</div>
            ) : (
              Object.entries(screenshotGroups).map(([stepKey, screenshots]) => (
                <article key={stepKey} className="audit-capture-group">
                  <strong>{stepKey}</strong>
                  <div className="audit-capture-strip">
                    {screenshots.map((screenshot) =>
                      screenshot.url ? (
                        <a
                          key={screenshot.id}
                          id={buildCaptureId(screenshot.path)}
                          className="audit-screenshot-thumb"
                          href={screenshot.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img alt={screenshot.label} src={screenshot.url} />
                          <span>{screenshot.label}</span>
                        </a>
                      ) : null
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="audit-live-panel">
          <div className="audit-panel-head">
            <h2>Stepper de respuesta</h2>
          </div>
          <div className="audit-analysis-grid">
            <article className="audit-analysis-block full-span">
              <div className="audit-result-group">
                <span>Estado</span>
                <p>{activeRun?.finalState ?? "sin datos"}</p>
              </div>
              <div className="audit-result-group">
                <span>Pregunta actual detectada</span>
                <p>{activeRun?.currentQuestion?.questionNumber ?? "pendiente"}</p>
              </div>
              <div className="audit-result-group">
                <span>Texto visible detectado</span>
                <p>{activeRun?.currentQuestion?.probableQuestionText ?? "pendiente"}</p>
              </div>
              <div className="audit-result-group">
                <span>Opciones visibles detectadas</span>
                <p>
                  {activeRun?.currentQuestion?.visibleOptionTexts?.length
                    ? activeRun.currentQuestion.visibleOptionTexts.join(" | ")
                    : "pendiente"}
                </p>
              </div>
              <div className="audit-result-group">
                <span>Radio count</span>
                <p>{activeRun?.currentQuestion?.radioCount ?? activeRun?.radioCount ?? 0}</p>
              </div>
              <div className="audit-result-group">
                <span>Radio seleccionado antes</span>
                <p>{activeRun?.currentQuestion?.selectedRadioBefore ?? "ninguno"}</p>
              </div>
              <div className="audit-result-group">
                <span>Error de extracción</span>
                <p>{activeRun?.currentQuestion?.error ?? "ninguno"}</p>
              </div>
              <div className="audit-result-group">
                <span>Preview DOM</span>
                <p>{truncateText(activeRun?.currentQuestion?.bodyTextPreview, 400)}</p>
              </div>
              {activeRun?.currentQuestion?.options?.length ? (
                <div className="audit-result-group">
                  <span>Selectores candidatos</span>
                  <p>
                    {activeRun.currentQuestion.options
                      .map((option) => `${option.label} -> ${option.selector}${option.checked ? " [checked]" : ""}`)
                      .join(" | ")}
                  </p>
                </div>
              ) : null}
            </article>
          </div>
        </section>

        <section className="audit-images-panel">
          <div className="audit-panel-head">
            <h2>A. Fotos detectadas</h2>
          </div>
          <div className="audit-images-row audit-images-row-wide">
            {imageLinks.length === 0 ? (
              <div className="audit-empty-panel compact">Sin fotos reales detectadas</div>
            ) : (
              imageLinks.map((image) => {
                const key = String(image.index);
                const state = photoStates[key] ?? "pending";

                return (
                  <article key={image.index} className="audit-image-card audit-image-card-wide">
                    <div className="audit-image-label">Foto {image.index}</div>
                    <div className="audit-image-thumb audit-image-thumb-large">
                      <img
                        alt={`Foto ${image.index}`}
                        src={image.href}
                        onLoad={() => setPhotoStates((current) => ({ ...current, [key]: "loaded" }))}
                        onError={() => setPhotoStates((current) => ({ ...current, [key]: "error" }))}
                      />
                    </div>
                    <div className="audit-image-meta">
                      <span>URL original: {truncateText(image.href, 70)}</span>
                      <span>Estado: {state}</span>
                      <span>Usada: no</span>
                      <span>Preguntas relacionadas: pendiente</span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="audit-analysis-panel">
          <div className="audit-panel-head">
            <h2>B. Analisis por foto</h2>
          </div>
          <div className="audit-analysis-grid">
            {imageLinks.length === 0 ? (
              <div className="audit-inline-empty">Pendiente de fotos reales</div>
            ) : (
              imageLinks.map((image) => {
                const analysis = perPhotoAnalysis.find((item) => item.photoIndex === image.index);

                return (
                  <article key={image.index} className="audit-analysis-block">
                    <h3>Foto {image.index}</h3>
                    <div className="audit-result-group">
                      <span>Estado</span>
                      <strong>{analysis ? "analyzed" : "pendiente"}</strong>
                    </div>
                    <div className="audit-result-group">
                      <span>Productos detectados</span>
                      <p>{analysis?.productsDetected?.length ? analysis.productsDetected.join(", ") : "Pendiente de analisis visual real"}</p>
                    </div>
                    <div className="audit-result-group">
                      <span>Marcas detectadas</span>
                      <p>{analysis?.brandsDetected?.length ? analysis.brandsDetected.join(", ") : "Pendiente de analisis visual real"}</p>
                    </div>
                    <div className="audit-result-group">
                      <span>Secciones detectadas</span>
                      <p>{analysis?.sectionsDetected?.length ? analysis.sectionsDetected.join(", ") : "Pendiente de analisis visual real"}</p>
                    </div>
                    <div className="audit-result-group">
                      <span>Observaciones</span>
                      <p>{analysis?.observations?.length ? analysis.observations.join(" | ") : "Pendiente de analisis visual real"}</p>
                    </div>
                    <div className="audit-result-group">
                      <span>Confianza</span>
                      <p>{analysis?.confidence ?? 0}</p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="audit-analysis-panel">
          <div className="audit-panel-head">
            <h2>C. Knowledge Base Consolidada</h2>
          </div>
          <div className="audit-analysis-grid">
            <article className="audit-analysis-block">
              <h3>Consolidado</h3>
              <div className="audit-consolidated-grid">
                <div className="audit-consolidated-line">
                  <span>Resumen</span>
                  <strong>{knowledgeBase.summary || "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Productos encontrados</span>
                  <strong>{knowledgeBase.productsDetected.length ? knowledgeBase.productsDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Productos ausentes</span>
                  <strong>{knowledgeBase.productsAbsent.length ? knowledgeBase.productsAbsent.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Marcas encontradas</span>
                  <strong>{knowledgeBase.brandsDetected.length ? knowledgeBase.brandsDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Categorias detectadas</span>
                  <strong>{knowledgeBase.categoriesDetected.length ? knowledgeBase.categoriesDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Secciones detectadas</span>
                  <strong>{knowledgeBase.sectionsDetected.length ? knowledgeBase.sectionsDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Orden detectado</span>
                  <strong>{knowledgeBase.orderingDetected.length ? knowledgeBase.orderingDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Ubicacion en gondola</span>
                  <strong>{knowledgeBase.shelfLocations.length ? knowledgeBase.shelfLocations.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Carteleria</span>
                  <strong>{knowledgeBase.signageDetected.length ? knowledgeBase.signageDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Precios visibles</span>
                  <strong>{knowledgeBase.visiblePrices.length ? knowledgeBase.visiblePrices.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Promociones</span>
                  <strong>{knowledgeBase.promotionsDetected.length ? knowledgeBase.promotionsDetected.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Facing / exhibicion</span>
                  <strong>{knowledgeBase.facingDisplaySignals.length ? knowledgeBase.facingDisplaySignals.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Senales visuales</span>
                  <strong>{knowledgeBase.relevantVisualSignals.length ? knowledgeBase.relevantVisualSignals.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Incertidumbres</span>
                  <strong>{knowledgeBase.uncertainties.length ? knowledgeBase.uncertainties.join(", ") : "PENDIENTE_ANALISIS_VISUAL"}</strong>
                </div>
                <div className="audit-consolidated-line">
                  <span>Fotos usadas</span>
                  <strong>{projectQuestions.some((question) => (question.storePhotosUsed?.length ?? 0) > 0) ? Array.from(new Set(projectQuestions.flatMap((question) => question.storePhotosUsed ?? []))).join(", ") : imageLinks.length > 0 ? "pendiente" : "sin fotos"}</strong>
                </div>
              </div>
            </article>

            <article className="audit-analysis-block">
              <h3>Estado real del worker</h3>
              <div className="audit-result-group">
                <span>Primera pregunta detectada</span>
                <strong>{activeRun?.detectedFirstQuestion ? "si" : "no"}</strong>
              </div>
              <div className="audit-result-group">
                <span>Pregunta visible</span>
                <p>{currentQuestion}</p>
              </div>
              <div className="audit-result-group">
                <span>imageLinks reales</span>
                <p>{imageLinks.length}</p>
              </div>
              <div className="audit-result-group">
                <span>radioCount real</span>
                <p>{activeRun?.radioCount ?? 0}</p>
              </div>
              <div className="audit-result-group">
                <span>finalBodyTextLength real</span>
                <p>{activeRun?.finalBodyTextLength ?? 0}</p>
              </div>
            </article>
          </div>
        </section>

        <section className="audit-analysis-panel">
          <div className="audit-panel-head">
            <div className="audit-panel-title-row">
              <h2>D. Banco de preguntas del proyecto</h2>
            </div>
            <div className="audit-panel-meta">
              <button className="audit-inline-button" type="button" onClick={handleLoadTemplate}>
                Vaciar banco
              </button>
              <button className="audit-inline-button" type="button" onClick={handleAddQuestion}>
                Agregar pregunta
              </button>
              <button className="audit-inline-button" type="button" onClick={() => importJsonRef.current?.click()}>
                Importar JSON
              </button>
              <button className="audit-inline-button" type="button" onClick={handleExportJson}>
                Exportar JSON
              </button>
              <input ref={importJsonRef} hidden type="file" accept="application/json" onChange={handleImportJson} />
            </div>
          </div>

          <div className="audit-question-grid">
            {projectQuestions.length === 0 ? (
              <article className="audit-question-card">
                <div className="audit-inline-empty">No hay preguntas precargadas todavía. Usa "Agregar pregunta" o "Importar JSON".</div>
              </article>
            ) : null}
            {projectQuestions.map((question, index) => {
              const evidenceReferences = questionEvidenceById.get(question.id) ?? [];

              return (
                <article key={question.id} className="audit-question-card">
                <div className="audit-question-card-head">
                  <h3>Pregunta {question.id}</h3>
                  <span className={`audit-status-pill state-${question.status}`}>{question.status}</span>
                </div>

                <div className="audit-field audit-field-inline">
                  <label htmlFor={`question-physical-number-${question.id}`}>Numero fisico</label>
                  <input
                    id={`question-physical-number-${question.id}`}
                    placeholder="Ej: 1, 4, 12"
                    value={question.physicalNumber ?? ""}
                    onChange={(event) => handleQuestionChange(index, { physicalNumber: event.target.value })}
                  />
                </div>

                <div className="audit-field audit-field-inline">
                  <label htmlFor={`question-active-${question.id}`}>Pregunta activa</label>
                  <input
                    id={`question-active-${question.id}`}
                    type="checkbox"
                    checked={question.active !== false}
                    onChange={(event) => handleQuestionChange(index, { active: event.target.checked })}
                  />
                </div>

                <div className="audit-question-preview audit-question-preview-large">
                  {question.referenceImageUrl ? (
                    <img alt={`Referencia de pregunta ${question.id}`} src={question.referenceImageUrl} />
                  ) : (
                    <div className="audit-inline-empty">Sin imagen de referencia</div>
                  )}
                </div>

                <div className="audit-question-upload-row">
                  <input
                    id={`question-image-url-${question.id}`}
                    placeholder="Pegar URL de imagen"
                    value={question.referenceImageUrl ?? ""}
                    onChange={(event) => handleQuestionChange(index, { referenceImageUrl: event.target.value })}
                  />
                  <input type="file" accept="image/*" onChange={(event) => void handleReferenceImageUpload(index, event)} />
                </div>
                {question.referenceImageFile ? <div className="audit-file-label">Archivo: {question.referenceImageFile}</div> : null}

                <details className="audit-collapsible">
                  <summary>Texto detectado / OCR manual</summary>
                  <div className="audit-field audit-field-inline">
                    <label htmlFor={`question-text-${question.id}`}>Texto de pregunta</label>
                    <textarea
                      id={`question-text-${question.id}`}
                      placeholder="Texto real de la pregunta precargada"
                      value={question.text ?? ""}
                      onChange={(event) => handleQuestionChange(index, { text: event.target.value })}
                    />
                  </div>
                </details>

                <details className="audit-collapsible">
                  <summary>Instrucciones específicas</summary>
                  <div className="audit-field audit-field-inline">
                    <textarea
                      id={`question-instructions-${question.id}`}
                      placeholder="Opcional"
                      value={question.specificInstructions ?? ""}
                      onChange={(event) => handleQuestionChange(index, { specificInstructions: event.target.value })}
                    />
                  </div>
                </details>

                <div className="audit-question-options">
                  <span>Opciones:</span>
                  {question.expectedOptions.map((option) => (
                    <span key={`${question.id}-${option}`} className="audit-option-pill">
                      {option}
                    </span>
                  ))}
                </div>

                <div className="audit-question-results">
                  <div className="audit-result-group">
                    <span>Estado</span>
                    <strong>{question.status}</strong>
                  </div>
                  <div className="audit-result-group">
                    <span>Respuesta sugerida</span>
                    <strong>{question.suggestedAnswer ?? "PENDIENTE_ANALISIS_VISUAL"}</strong>
                  </div>
                  <div className="audit-result-group">
                    <span>Confianza</span>
                    <p>{question.confidence ?? 0}</p>
                  </div>
                  <div className="audit-result-group">
                    <span>Razonamiento</span>
                    <p>{question.reasoning ?? "pendiente"}</p>
                  </div>
                  <div className="audit-result-group">
                    <span>Fotos de tienda usadas</span>
                    <p>{question.storePhotosUsed && question.storePhotosUsed.length > 0 ? question.storePhotosUsed.join(", ") : "pendiente"}</p>
                  </div>
                  <div className="audit-result-group">
                    <span>Evidencia / observaciones</span>
                    <p>{question.evidence && question.evidence.length > 0 ? question.evidence.join(" | ") : "pendiente"}</p>
                  </div>
                  <div className="audit-result-group">
                    <span>Evidencia visual</span>
                    <p>
                      {evidenceReferences.length > 0
                        ? evidenceReferences.map((reference, refIndex) => (
                            <span key={`${reference.captureId}-${reference.kind}`}>
                              {refIndex > 0 ? " | " : ""}
                              <a href={`#${reference.captureId}`}>{reference.label}</a>
                            </span>
                          ))
                        : "pendiente"}
                    </p>
                  </div>
                  <div className="audit-result-group">
                    <span>Diagnóstico visual</span>
                    <p>
                      {question.visualDiagnostic?.whatTheQuestionAsks
                        ? [
                            `whatTheQuestionAsks: ${question.visualDiagnostic.whatTheQuestionAsks}`,
                            `requiredEvidence: ${
                              question.visualDiagnostic.requiredEvidence.length > 0
                                ? question.visualDiagnostic.requiredEvidence.join(", ")
                                : "sin detalle"
                            }`,
                            `evidenceFound: ${
                              question.visualDiagnostic.evidenceFound.length > 0
                                ? question.visualDiagnostic.evidenceFound.join(", ")
                                : "sin detalle"
                            }`,
                            `evidenceMissing: ${
                              question.visualDiagnostic.evidenceMissing.length > 0
                                ? question.visualDiagnostic.evidenceMissing.join(", ")
                                : "sin detalle"
                            }`,
                            `visualComparisonWithReference: ${question.visualDiagnostic.visualComparisonWithReference || "sin detalle"}`,
                            `decisionRuleApplied: ${question.visualDiagnostic.decisionRuleApplied || "sin detalle"}`
                          ].join(" | ")
                        : "pendiente"}
                    </p>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        </section>

        <section className="audit-analysis-panel">
          <div className="audit-panel-head">
            <h2>Ejecucion de respuestas</h2>
          </div>
          <div className="audit-analysis-grid">
            {questionExecutionEntries.length === 0 ? (
              <div className="audit-inline-empty">Sin preguntas activas para ejecutar todavia.</div>
            ) : (
              questionExecutionEntries.map(({ question, traceEntry, evidenceReferences, state, error }) => (
                <article key={`execution-${question.id}`} className="audit-analysis-block">
                  <h3>Pregunta {question.physicalNumber || question.id}</h3>
                  <div className="audit-result-group">
                    <span>Respuesta calculada</span>
                    <strong>{question.suggestedAnswer ?? "pendiente"}</strong>
                  </div>
                  <div className="audit-result-group">
                    <span>Estado</span>
                    <strong>{state}</strong>
                  </div>
                  <div className="audit-result-group">
                    <span>Texto visible</span>
                    <p>{traceEntry?.visibleQuestionText ?? question.text ?? "pendiente"}</p>
                  </div>
                  <div className="audit-result-group">
                    <span>Selector usado</span>
                    <p>{traceEntry?.selectorUsed ?? "pendiente"}</p>
                  </div>
                  {error ? (
                    <div className="audit-result-group">
                      <span>Error</span>
                      <p>{error}</p>
                    </div>
                  ) : null}
                  <div className="audit-result-group">
                    <span>Screenshots</span>
                    <p>
                      {evidenceReferences.length > 0
                        ? evidenceReferences.map((reference, refIndex) => (
                            <span key={`${reference.captureId}-${reference.kind}`}>
                              {refIndex > 0 ? " | " : ""}
                              <a href={`#${reference.captureId}`}>{reference.label}</a>
                            </span>
                          ))
                        : "pendiente"}
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="audit-analysis-panel">
          <div className="audit-panel-head">
            <h2>E. Instrucciones generales del proyecto</h2>
          </div>
          <div className="audit-analysis-grid">
            <article className="audit-analysis-block full-span">
              <div className="audit-field audit-field-inline">
                <label htmlFor="generalInstructions">Criterios, reglas, taxonomía y confianza</label>
                <textarea
                  id="generalInstructions"
                  className="audit-general-instructions"
                  value={generalInstructions}
                  onChange={(event) => setGeneralInstructions(event.target.value)}
                />
              </div>
            </article>
          </div>
        </section>
      </div>

      <aside className="audit-results">
        <section className="audit-results-panel">
          <div className="audit-panel-head">
            <h2>Resumen operativo</h2>
          </div>
          <article className="audit-result-card">
            <div className="audit-result-group">
              <span>Estado</span>
              <p>{workspaceStatus}</p>
            </div>
            <div className="audit-result-group">
              <span>Estado final</span>
              <p>{activeRun?.finalState ?? "sin datos"}</p>
            </div>
            <div className="audit-result-group">
              <span>Tienda actual</span>
              <p>{currentStore}</p>
            </div>
            <div className="audit-result-group">
              <span>Paso actual</span>
              <p>{activeRun?.currentStep ?? "Esperando inicio"}</p>
            </div>
            <div className="audit-result-group">
              <span>Fotos reales detectadas</span>
              <p>{imageLinks.length}</p>
            </div>
            <div className="audit-result-group">
              <span>Preguntas precargadas reales</span>
              <p>{realPreloadedQuestionsCount}</p>
            </div>
            <div className="audit-result-group">
              <span>Preguntas activas para análisis</span>
              <p>{activeProjectQuestions.length}</p>
            </div>
            <div className="audit-result-group">
              <span>Preguntas inactivas</span>
              <p>{inactiveQuestionsCount}</p>
            </div>
            <div className="audit-result-group">
              <span>Preguntas detectadas en encuesta física</span>
              <p>{physicalSurveyQuestionsDetectedCount}</p>
            </div>
            <div className="audit-result-group">
              <span>Preguntas con imagen</span>
              <p>{questionsWithImageCount}</p>
            </div>
            <div className="audit-result-group">
              <span>Pendientes de análisis</span>
              <p>{pendingQuestionsCount}</p>
            </div>
            <div className="audit-result-group">
              <span>Respondidas</span>
              <p>{answeredQuestionsCount}</p>
            </div>
            <div className="audit-result-group">
              <span>Errores</span>
              <p>{previewError?.message ?? "ninguno"}</p>
            </div>
            {activeRun?.finalState === "WAITING_FOR_HUMAN_SUBMIT_CONFIRMATION" ? (
              <div className="audit-result-group">
                <span>Advertencia</span>
                <p>Listo para enviar, pendiente de aprobación humana.</p>
              </div>
            ) : null}
          </article>
        </section>

        <section className="audit-results-panel">
          <div className="audit-panel-head">
            <h2>Acción visual</h2>
          </div>
          <article className="audit-result-card">
            <div className="audit-result-group">
              <span>Start</span>
              <p>Navega la encuesta, extrae fotos reales y deja la cabina lista para análisis visual.</p>
            </div>
            <div className="audit-result-group">
              <span>Analizar visualmente</span>
              <p>Usa fotos reales de tienda, imágenes de referencia e instrucciones generales.</p>
            </div>
            <div className="audit-result-group">
              <span>Responder siguiente pregunta</span>
              <p>Lee el DOM actual, hace match de la pregunta, marca una sola respuesta y deja la revisión lista para continuar.</p>
            </div>
            <div className="audit-result-group">
              <span>Continuar a siguiente pregunta</span>
              <p>Hace click en CONTINUAR, captura la evidencia posterior y deja el stepper listo para el siguiente ciclo.</p>
            </div>
            <div className="audit-result-group">
              <span>Completar encuesta con trazabilidad</span>
              <p>Captura evidencia visual por pregunta, selecciona foto y deja la revisión final lista para aprobación humana.</p>
            </div>
            <div className="audit-result-group">
              <span>Enviar encuesta confirmada</span>
              <p>Hace el click final en Enviar y captura envío, número de diligenciamiento y pantalla final.</p>
            </div>
            <div className="audit-result-group">
              <span>Payload estimado</span>
              <p>
                {lastVisualRequestMeta.payloadSizeBytes} bytes | fotos: {lastVisualRequestMeta.photoCount} | preguntas:{" "}
                {lastVisualRequestMeta.questionCount}
              </p>
            </div>
            <div className="audit-result-group">
              <span>Fase A · Question Bank</span>
              <p>{visualPipelineState.phaseAQuestionBank}</p>
            </div>
            <div className="audit-result-group">
              <span>Fase B · Store Analysis</span>
              <p>{visualPipelineState.phaseBStoreAnalysis}</p>
            </div>
            <div className="audit-result-group">
              <span>Fase C · Answer Questions</span>
              <p>{visualPipelineState.phaseCAnswers}</p>
            </div>
            <div className="audit-result-group">
              <span>Resumen final</span>
              <p>
                answered: {visualPipelineState.answeredCount} | needs_review: {visualPipelineState.needsReviewCount} | pending:{" "}
                {visualPipelineState.pendingCount} | fotos usadas: {visualPipelineState.photosUsedCount}
              </p>
            </div>
            {visualPipelineState.batchStates.length > 0 ? (
              <div className="audit-result-group">
                <span>Progreso por batches</span>
                <p>
                  {visualPipelineState.batchStates
                    .map(
                      (batch) =>
                        `Batch ${batch.batchNumber}/${batch.totalBatches} ${batch.status} (${batch.questionIds.join(", ")})`
                    )
                    .join(" | ")}
                </p>
              </div>
            ) : null}
            <button
              className="audit-primary-button"
              type="button"
              disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting}
              onMouseDown={() => handleAnalyzeVisualMouseDown("results_panel")}
              onClick={() => void handleAnalyzeVisually("results_panel")}
            >
              {visualAnalyzing ? "Analizando..." : "Analizar visualmente"}
            </button>
            <button
              className="audit-secondary-button"
              type="button"
              disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canAnswerSurveyUntilPhoto}
              onClick={() => void handleAnswerSurveyUntilPhoto("results_panel")}
            >
              {surveyAnswering ? "Respondiendo..." : "Responder siguiente pregunta"}
            </button>
            <button
              className="audit-secondary-button"
              type="button"
              disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canContinueStepper}
              onClick={() => void handleContinueNextQuestion("results_panel")}
            >
              {surveyContinuing ? "Continuando..." : "Continuar a siguiente pregunta"}
            </button>
            <button
              className="audit-secondary-button"
              type="button"
              disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canCompleteSurveyWithTraceability}
              onClick={() => void handleCompleteSurveyWithTraceability("results_panel")}
            >
              {surveyCompleting ? "Completando..." : "Completar encuesta con trazabilidad"}
            </button>
            <button
              className="audit-secondary-button"
              type="button"
              disabled={visualAnalyzing || surveyAnswering || surveyContinuing || surveyCompleting || surveySubmitting || !canSubmitConfirmedSurvey}
              onClick={() => void handleSubmitConfirmedSurvey("results_panel")}
            >
              {surveySubmitting ? "Enviando..." : "Enviar encuesta confirmada"}
            </button>
            {visualAnalysisMessage ? (
              <div className="audit-info-banner compact-banner">{visualAnalysisMessage}</div>
            ) : null}
          </article>
        </section>

        <section className="audit-results-panel">
          <div className="audit-panel-head">
            <h2>Diagnóstico V2</h2>
          </div>
          <article className="audit-result-card">
            <details className="audit-collapsible">
              <summary>Ver diagnóstico técnico</summary>
              <pre>
                {JSON.stringify(
                  buildVisualPipelineV2Diagnostic({
                    pipelineState: visualPipelineState,
                    photoCount: imageLinks.length,
                    questionCount: activeProjectQuestions.length
                  }),
                  null,
                  2
                )}
              </pre>
              <details className="audit-collapsible">
                <summary>Logs de análisis</summary>
              {visualAnalysisLogs.length === 0 ? (
                <p>Sin logs de análisis todavía.</p>
              ) : (
                <>
                  {visualAnalysisLogs.map((log, index) => (
                    <pre key={`${log.timestamp}-${index}`}>
                      {JSON.stringify(
                        {
                          timestamp: log.timestamp,
                          message: log.message,
                          detail: log.detail ?? null
                        },
                        null,
                        2
                      )}
                    </pre>
                  ))}
                </>
              )}
              </details>
            </details>
          </article>
        </section>

        {activeRun?.questionMatchDebug ? (
          <section className="audit-results-panel">
            <div className="audit-panel-head">
              <h2>Fallo de match</h2>
            </div>
            <article className="audit-result-card">
              <div className="audit-result-group">
                <span>Razón</span>
                <p>{activeRun.questionMatchDebug.reason}</p>
              </div>
              <div className="audit-result-group">
                <span>Selector usado</span>
                <p>{activeRun.questionMatchDebug.selectorUsed}</p>
              </div>
              <div className="audit-result-group">
                <span>Texto visible extraído</span>
                <p>{activeRun.questionMatchDebug.visibleQuestionText || "sin texto principal"}</p>
              </div>
              <div className="audit-result-group">
                <span>Preguntas candidatas</span>
                <p>
                  {activeRun.questionMatchDebug.visibleQuestions.length
                    ? activeRun.questionMatchDebug.visibleQuestions.join(" | ")
                    : "sin candidatos"}
                </p>
              </div>
              <div className="audit-result-group">
                <span>Opciones visibles</span>
                <p>
                  {activeRun.questionMatchDebug.visibleOptions.length
                    ? activeRun.questionMatchDebug.visibleOptions.join(" | ")
                    : "sin opciones visibles"}
                </p>
              </div>
              <div className="audit-result-group">
                <span>Captura del fallo</span>
                <p>
                  {activeRun.questionMatchDebug.screenshotUrl ? (
                    <a href={activeRun.questionMatchDebug.screenshotUrl} target="_blank" rel="noreferrer">
                      Ver `question-match-failed.png`
                    </a>
                  ) : (
                    "captura no disponible"
                  )}
                </p>
              </div>
              <details className="audit-collapsible">
                <summary>Texto completo visible</summary>
                <pre>{activeRun.questionMatchDebug.bodyInnerText || "sin bodyInnerText"}</pre>
              </details>
              <details className="audit-collapsible">
                <summary>HTML parcial</summary>
                <pre>{activeRun.questionMatchDebug.htmlPreview || "sin htmlPreview"}</pre>
              </details>
            </article>
          </section>
        ) : null}

        <section className="audit-results-panel">
          <div className="audit-panel-head">
            <h2>TRAZABILIDAD DE LA CORRIDA</h2>
          </div>
          <article className="audit-result-card">
            <div className="audit-result-group">
              <span>Auditable</span>
              <p>{traceability ? (traceability.auditable ? "SI" : "WARNING") : "sin datos"}</p>
            </div>
            <div className="audit-result-group">
              <span>Estado de envío</span>
              <p>
                {activeRun?.finalState === "WAITING_FOR_HUMAN_SUBMIT_CONFIRMATION"
                  ? "Listo para enviar, pendiente de aprobación humana"
                  : activeRun?.finalState ?? "sin datos"}
              </p>
            </div>
            <div className="audit-result-group">
              <span>Número de diligenciamiento</span>
              <p>{activeRun?.surveyCompletionNumber ?? traceability?.surveyCompletionNumber?.surveyCompletionNumber ?? "pendiente"}</p>
            </div>
            {traceability?.incidents?.length ? (
              <div className="audit-result-group">
                <span>Warnings</span>
                <p>{traceability.incidents.map((item) => `${item.stage}: ${item.message}`).join(" | ")}</p>
              </div>
            ) : null}

            {traceability?.questionTraces?.length ? (
              <div className="audit-result-group">
                <span>Preguntas trazadas</span>
                <p>{traceability.questionTraces.length}. Cada pregunta expone respuesta, estado, selector y capturas antes/seleccionada/despues.</p>
              </div>
            ) : (
              <div className="audit-result-group">
                <span>Preguntas</span>
                <p>Sin trazabilidad por pregunta todavía.</p>
              </div>
            )}
            <div className="audit-result-group">
              <span>Capturas del recorrido</span>
              <p>Incluye evidencia por pregunta y pantallas finales como `evidence-photos-before`, `evidence-photos-selected`, `final-send-screen` y `final-confirmation`.</p>
            </div>
          </article>
        </section>

        <section className="audit-results-panel">
          <div className="audit-panel-head">
            <h2>Resultados del lote</h2>
          </div>

          <div className="audit-batch-table">
            <div className="audit-batch-row audit-batch-head">
              <span>Store Code</span>
              <span>Estado</span>
              <span>Questionnaire #</span>
            </div>
            {batchRows.map((row) => (
              <div key={row.storeCode} className="audit-batch-row">
                <span>{row.storeCode}</span>
                <span>{row.status}</span>
                <span>{row.questionnaireNumber}</span>
              </div>
            ))}
          </div>

          <button className="audit-export-button" type="button" onClick={handleExportCsv}>
            Exportar CSV
          </button>
        </section>

        {previewError ? (
          <section className="audit-results-panel">
            <div className="audit-panel-head">
              <h2>Error real</h2>
            </div>
            <article className="audit-result-card audit-error-card">
              <div className="audit-result-group">
                <span>Mensaje</span>
                <p>{previewError.message}</p>
              </div>
              <div className="audit-result-group">
                <span>Endpoint</span>
                <p>{previewError.endpoint ?? "sin endpoint"}</p>
              </div>
              <div className="audit-result-group">
                <span>Status</span>
                <p>{previewError.status ?? "sin status"}</p>
              </div>
              <div className="audit-result-group">
                <span>Body</span>
                <pre>{previewError.body ? JSON.stringify(previewError.body, null, 2) : "sin body"}</pre>
              </div>
              <div className="audit-result-group">
                <span>Stack</span>
                <pre>{previewError.stack ?? "sin stack"}</pre>
              </div>
              <div className="audit-result-group">
                <span>Batch</span>
                <p>{previewError.batch ?? "sin batch"}</p>
              </div>
              <div className="audit-result-group">
                <span>Question IDs</span>
                <p>{previewError.questionIds && previewError.questionIds.length > 0 ? previewError.questionIds.join(", ") : "sin questionIds"}</p>
              </div>
              <div className="audit-result-group">
                <span>OPENAI API Key</span>
                <p>
                  {previewError.openAiApiKeyConfigured === null || previewError.openAiApiKeyConfigured === undefined
                    ? "sin dato"
                    : previewError.openAiApiKeyConfigured
                      ? "configurada"
                      : "faltante"}
                </p>
              </div>
              <div className="audit-result-group">
                <span>Fotos reales recibidas</span>
                <p>{previewError.storePhotosReceived ?? "sin dato"}</p>
              </div>
              <div className="audit-result-group">
                <span>Preguntas recibidas</span>
                <p>{previewError.projectQuestionsReceived ?? "sin dato"}</p>
              </div>
              <div className="audit-result-group">
                <span>Referencias recibidas</span>
                <p>{previewError.referenceImagesReceived ?? "sin dato"}</p>
              </div>
            </article>
          </section>
        ) : null}
      </aside>
    </section>
  );
}
