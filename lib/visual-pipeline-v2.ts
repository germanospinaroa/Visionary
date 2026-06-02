import type {
  VisualKnowledgeBase,
  VisualPerPhotoAnalysis,
  VisualQuestionResult,
  VisualQuestionUnderstanding,
  VisualStoreAnalysisResponse
} from "@/lib/new-audit-visual-analysis";

export type VisualPipelineV2QuestionInput = {
  id: number;
  physicalNumber?: string;
  active: boolean;
  text?: string;
  referenceImageUrl?: string;
  referenceImageDataUrl?: string;
  specificInstructions?: string;
  expectedOptions: string[];
};

export type VisualPipelineV2StorePhotoInput = {
  index: number;
  url: string;
  previewUrl: string;
  source: string;
  text: string;
};

export type VisualPipelineV2LogEntry = {
  message: string;
  detail?: unknown;
};

export type VisualPipelineV2BatchState = {
  batchNumber: number;
  totalBatches: number;
  questionIds: number[];
  status: "pending" | "running" | "completed" | "failed";
  errorMessage: string | null;
};

export type VisualPipelineV2RequestMeta = {
  payloadSizeBytes: number;
  photoCount: number;
  questionCount: number;
  rawText: string;
  status: number;
};

export type VisualPipelineV2PartialResult = {
  questionUnderstanding: VisualQuestionUnderstanding[];
  knowledgeBase: VisualKnowledgeBase | null;
  perPhotoAnalysis: VisualPerPhotoAnalysis[];
  questionResults: VisualQuestionResult[];
  batchStates: VisualPipelineV2BatchState[];
};

export type VisualPipelineV2ErrorCode =
  | "INPUT_VALIDATION_FAILED"
  | "PHASE_A_FAILED"
  | "PHASE_B_FAILED"
  | "PHASE_C_FAILED";

export class VisualPipelineV2Error extends Error {
  code: VisualPipelineV2ErrorCode;
  detail: {
    endpoint?: string;
    status?: number | null;
    body?: unknown;
    rawText?: string;
    expectedQuestionIds?: number[];
    receivedQuestionIds?: number[];
    missingQuestionIds?: number[];
    partialResult?: VisualPipelineV2PartialResult;
  };

  constructor(
    code: VisualPipelineV2ErrorCode,
    message: string,
    detail: VisualPipelineV2Error["detail"] = {}
  ) {
    super(message);
    this.name = "VisualPipelineV2Error";
    this.code = code;
    this.detail = detail;
  }
}

export type VisualPipelineV2Callbacks = {
  onLog?: (entry: VisualPipelineV2LogEntry) => void;
  onRequestMeta?: (meta: VisualPipelineV2RequestMeta) => void;
  onPhaseACompleted?: (result: {
    questionUnderstanding: VisualQuestionUnderstanding[];
    receivedQuestionIds: number[];
    missingQuestionIds: number[];
  }) => void;
  onPhaseBCompleted?: (result: {
    knowledgeBase: VisualKnowledgeBase;
    perPhotoAnalysis: VisualPerPhotoAnalysis[];
  }) => void;
  onPhaseCBatchStarted?: (batchState: VisualPipelineV2BatchState) => void;
  onPhaseCBatchCompleted?: (result: {
    batchState: VisualPipelineV2BatchState;
    questionResults: VisualQuestionResult[];
  }) => void;
  onPhaseCBatchFailed?: (result: {
    batchState: VisualPipelineV2BatchState;
    questionResults: VisualQuestionResult[];
    missingQuestionIds: number[];
    message: string;
  }) => void;
};

export type VisualPipelineV2Input = {
  activeQuestions: VisualPipelineV2QuestionInput[];
  storePhotos: VisualPipelineV2StorePhotoInput[];
  generalInstructions: string;
  timeoutMs?: number;
  phaseAMaxAttempts?: number;
  answerBatchSize?: number;
  callbacks?: VisualPipelineV2Callbacks;
};

export type VisualPipelineV2Result = {
  questionUnderstanding: VisualQuestionUnderstanding[];
  knowledgeBase: VisualKnowledgeBase;
  perPhotoAnalysis: VisualPerPhotoAnalysis[];
  questionResults: VisualQuestionResult[];
  batchStates: VisualPipelineV2BatchState[];
};

const DEFAULT_TIMEOUT_MS = 75_000;
const DEFAULT_PHASE_A_MAX_ATTEMPTS = 3;
const DEFAULT_ANSWER_BATCH_SIZE = 2;

function estimateUtf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function splitIntoChunks<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function emitLog(input: VisualPipelineV2Input, message: string, detail?: unknown) {
  input.callbacks?.onLog?.({
    message,
    detail
  });
}

async function postJson<T>(
  input: VisualPipelineV2Input,
  endpoint: string,
  payload: unknown,
  photoCount: number,
  questionCount: number,
  timeoutMessage: string
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const payloadSizeBytes = estimateUtf8Bytes(JSON.stringify(payload));

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }

    throw error;
  }

  window.clearTimeout(timeoutId);

  const rawText = await response.text();
  input.callbacks?.onRequestMeta?.({
    payloadSizeBytes,
    photoCount,
    questionCount,
    rawText,
    status: response.status
  });

  let parsed: T | { error?: unknown } | string;
  try {
    parsed = rawText ? (JSON.parse(rawText) as T | { error?: unknown }) : "";
  } catch {
    parsed = rawText;
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "error" in parsed &&
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed === "string" && parsed
          ? parsed
          : "VISUAL_PIPELINE_V2_REQUEST_FAILED";
    throw new VisualPipelineV2Error("INPUT_VALIDATION_FAILED", message, {
      endpoint,
      status: response.status,
      body: parsed,
      rawText
    });
  }

  if (typeof parsed === "string") {
    throw new Error(parsed || "VISUAL_PIPELINE_V2_REQUEST_FAILED");
  }

  return {
    parsed: parsed as T,
    response,
    rawText,
    payloadSizeBytes
  };
}

export function assertCompleteQuestionUnderstanding(
  expectedQuestionIds: number[],
  questionUnderstanding: VisualQuestionUnderstanding[]
) {
  const receivedQuestionIds = Array.from(
    new Set(
      questionUnderstanding
        .map((question) => question.questionId)
        .filter((questionId) => typeof questionId === "number")
    )
  );
  const missingQuestionIds = expectedQuestionIds.filter((questionId) => !receivedQuestionIds.includes(questionId));

  if (missingQuestionIds.length > 0) {
    throw new VisualPipelineV2Error(
      "PHASE_A_FAILED",
      `Fase A incompleta: faltan preguntas ${missingQuestionIds.join(", ")}.`,
      {
        expectedQuestionIds,
        receivedQuestionIds,
        missingQuestionIds
      }
    );
  }

  return {
    receivedQuestionIds,
    missingQuestionIds
  };
}

export function assertCompleteAnswers(expectedQuestionIds: number[], questionResults: VisualQuestionResult[]) {
  const receivedQuestionIds = Array.from(
    new Set(
      questionResults
        .map((question) => question.questionId)
        .filter((questionId) => typeof questionId === "number")
    )
  );
  const missingQuestionIds = expectedQuestionIds.filter((questionId) => !receivedQuestionIds.includes(questionId));

  if (missingQuestionIds.length > 0) {
    throw new VisualPipelineV2Error(
      "PHASE_C_FAILED",
      `Fase C incompleta: faltan respuestas ${missingQuestionIds.join(", ")}.`,
      {
        expectedQuestionIds,
        receivedQuestionIds,
        missingQuestionIds
      }
    );
  }

  return {
    receivedQuestionIds,
    missingQuestionIds
  };
}

function validateInputs(input: VisualPipelineV2Input) {
  if (input.storePhotos.length === 0) {
    throw new VisualPipelineV2Error("INPUT_VALIDATION_FAILED", "No hay fotos reales detectadas para analizar.");
  }

  if (input.activeQuestions.length === 0) {
    throw new VisualPipelineV2Error("INPUT_VALIDATION_FAILED", "No hay preguntas activas para analizar.");
  }

  if (!input.generalInstructions.trim()) {
    throw new VisualPipelineV2Error("INPUT_VALIDATION_FAILED", "Faltan instrucciones generales del proyecto.");
  }
}

export async function phaseAUnderstandQuestions(
  input: VisualPipelineV2Input
): Promise<{
  questionUnderstanding: VisualQuestionUnderstanding[];
  receivedQuestionIds: number[];
  missingQuestionIds: number[];
}> {
  const expectedQuestionIds = input.activeQuestions.map((question) => question.id);
  const understandingById = new Map<number, VisualQuestionUnderstanding>();
  let remainingQuestions = [...input.activeQuestions];
  const startedAt = Date.now();
  const maxAttempts = input.phaseAMaxAttempts ?? DEFAULT_PHASE_A_MAX_ATTEMPTS;

  emitLog(input, "PHASE_A_STARTED", {
    questionIds: expectedQuestionIds,
    questionCount: expectedQuestionIds.length
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      emitLog(input, "PHASE_A_RETRY_MISSING", {
        attempt,
        missingQuestionIds: remainingQuestions.map((question) => question.id)
      });
    }

    const payload = {
      projectQuestions: remainingQuestions,
      generalInstructions: input.generalInstructions
    };
    let result: Awaited<
      ReturnType<typeof postJson<{ questionUnderstanding: VisualQuestionUnderstanding[] }>>
    >;
    try {
      result = await postJson<{ questionUnderstanding: VisualQuestionUnderstanding[] }>(
        input,
        "/api/new-audit/analyze-question-bank",
        payload,
        0,
        remainingQuestions.length,
        `Fase A excedio el timeout en el intento ${attempt}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fase A fallo.";
      emitLog(input, "PHASE_A_FAILED", {
        questionIds: expectedQuestionIds,
        receivedQuestionIds: Array.from(understandingById.keys()),
        missingQuestionIds: remainingQuestions.map((question) => question.id),
        attempts: attempt,
        durationMs: Date.now() - startedAt
      });
      if (error instanceof VisualPipelineV2Error) {
        throw new VisualPipelineV2Error("PHASE_A_FAILED", message, {
          ...error.detail,
          expectedQuestionIds,
          receivedQuestionIds: Array.from(understandingById.keys()),
          missingQuestionIds: remainingQuestions.map((question) => question.id),
          partialResult: {
            questionUnderstanding: Array.from(understandingById.values()),
            knowledgeBase: null,
            perPhotoAnalysis: [],
            questionResults: [],
            batchStates: []
          }
        });
      }

      throw new VisualPipelineV2Error("PHASE_A_FAILED", message, {
        expectedQuestionIds,
        receivedQuestionIds: Array.from(understandingById.keys()),
        missingQuestionIds: remainingQuestions.map((question) => question.id),
        partialResult: {
          questionUnderstanding: Array.from(understandingById.values()),
          knowledgeBase: null,
          perPhotoAnalysis: [],
          questionResults: [],
          batchStates: []
        }
      });
    }

    for (const item of result.parsed.questionUnderstanding ?? []) {
      if (typeof item.questionId === "number") {
        understandingById.set(item.questionId, item);
      }
    }

    const mergedUnderstanding = expectedQuestionIds
      .map((questionId) => understandingById.get(questionId))
      .filter((item): item is VisualQuestionUnderstanding => Boolean(item));

    const completion = (() => {
      try {
        return assertCompleteQuestionUnderstanding(expectedQuestionIds, mergedUnderstanding);
      } catch (error) {
        if (error instanceof VisualPipelineV2Error) {
          return error.detail;
        }

        throw error;
      }
    })();

    const missingQuestionIds = completion.missingQuestionIds ?? [];
    if (missingQuestionIds.length === 0) {
      emitLog(input, "PHASE_A_COMPLETED", {
        questionIds: expectedQuestionIds,
        receivedQuestionIds: completion.receivedQuestionIds ?? expectedQuestionIds,
        missingQuestionIds: [],
        durationMs: Date.now() - startedAt
      });
      return {
        questionUnderstanding: mergedUnderstanding,
        receivedQuestionIds: completion.receivedQuestionIds ?? expectedQuestionIds,
        missingQuestionIds: []
      };
    }

    remainingQuestions = input.activeQuestions.filter((question) => missingQuestionIds.includes(question.id));
  }

  const partialUnderstanding = expectedQuestionIds
    .map((questionId) => understandingById.get(questionId))
    .filter((item): item is VisualQuestionUnderstanding => Boolean(item));
  const receivedQuestionIds = partialUnderstanding.map((question) => question.questionId);
  const missingQuestionIds = expectedQuestionIds.filter((questionId) => !receivedQuestionIds.includes(questionId));

  emitLog(input, "PHASE_A_FAILED", {
    questionIds: expectedQuestionIds,
    receivedQuestionIds,
    missingQuestionIds,
    attempts: maxAttempts,
    durationMs: Date.now() - startedAt
  });

  throw new VisualPipelineV2Error("PHASE_A_FAILED", `Fase A incompleta tras ${maxAttempts} intentos.`, {
    expectedQuestionIds,
    receivedQuestionIds,
    missingQuestionIds,
    partialResult: {
      questionUnderstanding: partialUnderstanding,
      knowledgeBase: null,
      perPhotoAnalysis: [],
      questionResults: [],
      batchStates: []
    }
  });
}

export async function phaseBAnalyzeStorePhotos(
  input: VisualPipelineV2Input
): Promise<{
  knowledgeBase: VisualKnowledgeBase;
  perPhotoAnalysis: VisualPerPhotoAnalysis[];
}> {
  const startedAt = Date.now();

  emitLog(input, "PHASE_B_STARTED", {
    photoCount: input.storePhotos.length
  });

  try {
    const payload = {
      storePhotos: input.storePhotos,
      generalInstructions: input.generalInstructions
    };
    const result = await postJson<VisualStoreAnalysisResponse>(
      input,
      "/api/new-audit/analyze-store-photos",
      payload,
      input.storePhotos.length,
      0,
      "Fase B excedio el timeout del servidor."
    );

    emitLog(input, "PHASE_B_COMPLETED", {
      photoCount: input.storePhotos.length,
      durationMs: Date.now() - startedAt
    });

    return {
      knowledgeBase: result.parsed.knowledgeBase,
      perPhotoAnalysis: result.parsed.perPhotoAnalysis
    };
  } catch (error) {
    if (error instanceof VisualPipelineV2Error) {
      throw new VisualPipelineV2Error("PHASE_B_FAILED", error.message, error.detail);
    }

    throw new VisualPipelineV2Error("PHASE_B_FAILED", error instanceof Error ? error.message : "Fase B fallo.");
  }
}

export async function phaseCAnswerQuestions(
  input: VisualPipelineV2Input,
  phaseAResult: { questionUnderstanding: VisualQuestionUnderstanding[] },
  phaseBResult: { knowledgeBase: VisualKnowledgeBase; perPhotoAnalysis: VisualPerPhotoAnalysis[] }
): Promise<{
  questionResults: VisualQuestionResult[];
  batchStates: VisualPipelineV2BatchState[];
}> {
  const activeQuestionIds = input.activeQuestions.map((question) => question.id);
  const questionUnderstandingIds = phaseAResult.questionUnderstanding.map((question) => question.questionId);
  const answerBatchSize = input.answerBatchSize ?? DEFAULT_ANSWER_BATCH_SIZE;
  const chunks = splitIntoChunks(input.activeQuestions, answerBatchSize);
  const batchStates: VisualPipelineV2BatchState[] = chunks.map((chunk, index) => ({
    batchNumber: index + 1,
    totalBatches: chunks.length,
    questionIds: chunk.map((question) => question.id),
    status: "pending",
    errorMessage: null
  }));
  const questionResultsById = new Map<number, VisualQuestionResult>();
  const startedAt = Date.now();

  emitLog(input, "PHASE_C_STARTED", {
    questionIds: activeQuestionIds,
    questionCount: activeQuestionIds.length,
    totalBatches: chunks.length
  });

  try {
    assertCompleteQuestionUnderstanding(activeQuestionIds, phaseAResult.questionUnderstanding);
  } catch (error) {
    const detail = error instanceof VisualPipelineV2Error ? error.detail : {};
    throw new VisualPipelineV2Error("PHASE_C_FAILED", "Fase C requiere questionUnderstanding completo.", {
      ...detail,
      partialResult: {
        questionUnderstanding: phaseAResult.questionUnderstanding,
        knowledgeBase: phaseBResult.knowledgeBase,
        perPhotoAnalysis: phaseBResult.perPhotoAnalysis,
        questionResults: [],
        batchStates
      }
    });
  }

  for (const [index, chunk] of chunks.entries()) {
    const batchState = batchStates[index];
    if (!batchState) {
      continue;
    }

    batchState.status = "running";
    input.callbacks?.onPhaseCBatchStarted?.({ ...batchState });

    const batchQuestionIds = chunk.map((question) => question.id);
    const preparedQuestionUnderstanding = phaseAResult.questionUnderstanding.filter((question) =>
      batchQuestionIds.includes(question.questionId)
    );

    emitLog(input, "PHASE_C_INPUT_IDS", {
      activeQuestionIds,
      questionUnderstandingIds,
      previousResultIds: Array.from(questionResultsById.keys()),
      answerPayloadQuestionIds: preparedQuestionUnderstanding.map((question) => question.questionId),
      batchNumber: batchState.batchNumber,
      totalBatches: batchState.totalBatches
    });

    try {
      const payload = {
        questionUnderstanding: preparedQuestionUnderstanding,
        storePhotos: input.storePhotos,
        knowledgeBase: phaseBResult.knowledgeBase,
        perPhotoAnalysis: phaseBResult.perPhotoAnalysis,
        generalInstructions: input.generalInstructions
      };
      const result = await postJson<{ questionResults: VisualQuestionResult[] }>(
        input,
        "/api/new-audit/answer-questions",
        payload,
        input.storePhotos.length,
        preparedQuestionUnderstanding.length,
        `Fase C excedio el timeout en el batch ${batchState.batchNumber}/${batchState.totalBatches}.`
      );

      const batchQuestionResults = result.parsed.questionResults ?? [];
      const completion = assertCompleteAnswers(batchQuestionIds, batchQuestionResults);

      for (const item of batchQuestionResults) {
        questionResultsById.set(item.questionId, item);
      }

      batchState.status = "completed";
      input.callbacks?.onPhaseCBatchCompleted?.({
        batchState: { ...batchState },
        questionResults: batchQuestionResults
      });

      if (completion.missingQuestionIds.length > 0) {
        throw new VisualPipelineV2Error(
          "PHASE_C_FAILED",
          `Batch incompleto: faltan respuestas ${completion.missingQuestionIds.join(", ")}.`,
          {
            expectedQuestionIds: batchQuestionIds,
            receivedQuestionIds: completion.receivedQuestionIds,
            missingQuestionIds: completion.missingQuestionIds
          }
        );
      }
    } catch (error) {
      const detail = error instanceof VisualPipelineV2Error ? error.detail : {};
      const message = error instanceof Error ? error.message : "Fase C fallo.";
      batchState.status = "failed";
      batchState.errorMessage = message;
      input.callbacks?.onPhaseCBatchFailed?.({
        batchState: { ...batchState },
        questionResults: Array.from(questionResultsById.values()),
        missingQuestionIds: detail.missingQuestionIds ?? batchQuestionIds,
        message
      });
      throw new VisualPipelineV2Error("PHASE_C_FAILED", message, {
        ...detail,
        partialResult: {
          questionUnderstanding: phaseAResult.questionUnderstanding,
          knowledgeBase: phaseBResult.knowledgeBase,
          perPhotoAnalysis: phaseBResult.perPhotoAnalysis,
          questionResults: Array.from(questionResultsById.values()),
          batchStates: batchStates.map((item) => ({ ...item }))
        }
      });
    }
  }

  const questionResults = activeQuestionIds
    .map((questionId) => questionResultsById.get(questionId))
    .filter((item): item is VisualQuestionResult => Boolean(item));

  const completion = assertCompleteAnswers(activeQuestionIds, questionResults);
  emitLog(input, "PHASE_C_COMPLETED", {
    answeredQuestionIds: completion.receivedQuestionIds,
    failedQuestionIds: [],
    durationMs: Date.now() - startedAt,
    totalBatches: batchStates.length
  });

  return {
    questionResults,
    batchStates
  };
}

export async function runVisualAuditV2(input: VisualPipelineV2Input): Promise<VisualPipelineV2Result> {
  const startedAt = Date.now();
  emitLog(input, "PIPELINE_V2_STARTED", {
    questionCount: input.activeQuestions.length,
    photoCount: input.storePhotos.length
  });

  validateInputs(input);
  emitLog(input, "INPUTS_VALIDATED", {
    questionIds: input.activeQuestions.map((question) => question.id),
    photoCount: input.storePhotos.length
  });

  const phaseAResult = await phaseAUnderstandQuestions(input);
  input.callbacks?.onPhaseACompleted?.(phaseAResult);

  assertCompleteQuestionUnderstanding(
    input.activeQuestions.map((question) => question.id),
    phaseAResult.questionUnderstanding
  );

  const phaseBResult = await phaseBAnalyzeStorePhotos(input);
  input.callbacks?.onPhaseBCompleted?.(phaseBResult);

  const phaseCResult = await phaseCAnswerQuestions(input, phaseAResult, phaseBResult);

  assertCompleteAnswers(
    input.activeQuestions.map((question) => question.id),
    phaseCResult.questionResults
  );

  emitLog(input, "PIPELINE_V2_COMPLETED", {
    durationMs: Date.now() - startedAt,
    questionIds: input.activeQuestions.map((question) => question.id)
  });

  return {
    questionUnderstanding: phaseAResult.questionUnderstanding,
    knowledgeBase: phaseBResult.knowledgeBase,
    perPhotoAnalysis: phaseBResult.perPhotoAnalysis,
    questionResults: phaseCResult.questionResults,
    batchStates: phaseCResult.batchStates
  };
}

export const visualPipelineV2 = {
  runVisualAuditV2,
  phaseAUnderstandQuestions,
  phaseBAnalyzeStorePhotos,
  phaseCAnswerQuestions,
  assertCompleteQuestionUnderstanding,
  assertCompleteAnswers
};
