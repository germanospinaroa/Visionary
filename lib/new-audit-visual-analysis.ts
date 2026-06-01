import { getOpenAIClient } from "@/lib/openai";

type ImageInput =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type VisualStorePhotoInput = {
  index: number;
  url?: string;
  href?: string;
  previewUrl?: string;
  source?: string;
  text?: string;
};

export type VisualQuestionInput = {
  id: number;
  physicalNumber?: string;
  text?: string;
  referenceImage?: string;
  referenceImageUrl?: string;
  referenceImageDataUrl?: string;
  specificInstructions?: string;
  expectedOptions: string[];
};

export type VisualQuestionUnderstanding = {
  questionId: number;
  physicalNumber: string;
  questionText: string;
  expectedOptions: string[];
  targetBrand: string[];
  targetProduct: string[];
  targetVariants: string[];
  targetCategory: string[];
  visualCuesFromReference: string[];
  successCriteria: string[];
  failureCriteria: string[];
  noAnswerCriteria: string[];
  optionMapping: Array<{
    option: string;
    meaning: string;
  }>;
};

export type VisualQuestionResult = {
  questionId: number;
  questionText?: string;
  targetVisible: boolean;
  targetMatchConfidence: number;
  targetEvidence: Array<{
    sourceType: "storePhoto" | "referenceImage";
    storePhotoIndex?: number;
    detail: string;
  }>;
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
};

export type VisualPerPhotoAnalysis = {
  photoIndex: number;
  brandsDetected: string[];
  productsDetected: string[];
  sectionsDetected: string[];
  observations: string[];
  confidence: number;
};

export type VisualKnowledgeBase = {
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
};

export type VisualStoreAnalysisResponse = {
  storeVisualMemory: {
    brandsDetected: string[];
    productsDetected: string[];
    productsAbsent: string[];
    sectionsDetected: string[];
    shelfStructure: string[];
    orderingDetected: string[];
    signageDetected: string[];
    uncertainties: string[];
    photoSummaries: string[];
  };
  knowledgeBase: VisualKnowledgeBase;
  perPhotoAnalysis: VisualPerPhotoAnalysis[];
  confirmedProducts: string[];
  confirmedBrands: string[];
  visibleTexts: string[];
  shelfSections: string[];
  uncertainties: string[];
};

export type VisualAnswerQuestionsResponse = {
  questionResults: VisualQuestionResult[];
};

export type VisualAnalysisResponse = {
  questionUnderstanding: VisualQuestionUnderstanding[];
  knowledgeBase: VisualKnowledgeBase;
  perPhotoAnalysis: VisualPerPhotoAnalysis[];
  questionResults: VisualQuestionResult[];
};

export type VisualAnalysisValidation = {
  activeQuestions: VisualQuestionInput[];
  referenceCount: number;
};

const ANALYZE_VISUAL_SCHEMA = {
  name: "new_audit_visual_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["questionUnderstanding", "knowledgeBase", "perPhotoAnalysis", "questionResults"],
    properties: {
      questionUnderstanding: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "questionId",
            "physicalNumber",
            "questionText",
            "expectedOptions",
            "targetBrand",
            "targetProduct",
            "targetVariants",
            "targetCategory",
            "visualCuesFromReference",
            "successCriteria",
            "failureCriteria",
            "noAnswerCriteria",
            "optionMapping"
          ],
          properties: {
            questionId: { type: "integer" },
            physicalNumber: { type: "string" },
            questionText: { type: "string" },
            expectedOptions: { type: "array", items: { type: "string" } },
            targetBrand: { type: "array", items: { type: "string" } },
            targetProduct: { type: "array", items: { type: "string" } },
            targetVariants: { type: "array", items: { type: "string" } },
            targetCategory: { type: "array", items: { type: "string" } },
            visualCuesFromReference: { type: "array", items: { type: "string" } },
            successCriteria: { type: "array", items: { type: "string" } },
            failureCriteria: { type: "array", items: { type: "string" } },
            noAnswerCriteria: { type: "array", items: { type: "string" } },
            optionMapping: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["option", "meaning"],
                properties: {
                  option: { type: "string" },
                  meaning: { type: "string" }
                }
              }
            }
          }
        }
      },
      knowledgeBase: {
        type: "object",
        additionalProperties: false,
        required: [
          "summary",
          "brandsDetected",
          "productsDetected",
          "productsAbsent",
          "categoriesDetected",
          "sectionsDetected",
          "orderingDetected",
          "shelfLocations",
          "signageDetected",
          "visiblePrices",
          "promotionsDetected",
          "facingDisplaySignals",
          "relevantVisualSignals",
          "uncertainties"
        ],
        properties: {
          summary: { type: "string" },
          brandsDetected: { type: "array", items: { type: "string" } },
          productsDetected: { type: "array", items: { type: "string" } },
          productsAbsent: { type: "array", items: { type: "string" } },
          categoriesDetected: { type: "array", items: { type: "string" } },
          sectionsDetected: { type: "array", items: { type: "string" } },
          orderingDetected: { type: "array", items: { type: "string" } },
          shelfLocations: { type: "array", items: { type: "string" } },
          signageDetected: { type: "array", items: { type: "string" } },
          visiblePrices: { type: "array", items: { type: "string" } },
          promotionsDetected: { type: "array", items: { type: "string" } },
          facingDisplaySignals: { type: "array", items: { type: "string" } },
          relevantVisualSignals: { type: "array", items: { type: "string" } },
          uncertainties: { type: "array", items: { type: "string" } }
        }
      },
      perPhotoAnalysis: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "photoIndex",
            "brandsDetected",
            "productsDetected",
            "sectionsDetected",
            "observations",
            "confidence"
          ],
          properties: {
            photoIndex: { type: "integer" },
            brandsDetected: { type: "array", items: { type: "string" } },
            productsDetected: { type: "array", items: { type: "string" } },
            sectionsDetected: { type: "array", items: { type: "string" } },
            observations: { type: "array", items: { type: "string" } },
            confidence: { type: "number" }
          }
        }
      },
      questionResults: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "questionId",
            "questionText",
            "targetVisible",
            "targetMatchConfidence",
            "targetEvidence",
            "answer",
            "confidence",
            "reasoning",
            "storePhotosUsed",
            "evidence",
            "visualDiagnostic",
            "status"
          ],
          properties: {
            questionId: { type: "integer" },
            questionText: { type: "string" },
            targetVisible: { type: "boolean" },
            targetMatchConfidence: { type: "number" },
            targetEvidence: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["sourceType", "detail"],
                properties: {
                  sourceType: { type: "string", enum: ["storePhoto", "referenceImage"] },
                  storePhotoIndex: { type: "integer" },
                  detail: { type: "string" }
                }
              }
            },
            answer: { type: "string" },
            confidence: { type: "number" },
            reasoning: { type: "string" },
            storePhotosUsed: { type: "array", items: { type: "integer" } },
            evidence: { type: "array", items: { type: "string" } },
            visualDiagnostic: {
              type: "object",
              additionalProperties: false,
              required: [
                "whatTheQuestionAsks",
                "requiredEvidence",
                "evidenceFound",
                "evidenceMissing",
                "visualComparisonWithReference",
                "decisionRuleApplied"
              ],
              properties: {
                whatTheQuestionAsks: { type: "string" },
                requiredEvidence: { type: "array", items: { type: "string" } },
                evidenceFound: { type: "array", items: { type: "string" } },
                evidenceMissing: { type: "array", items: { type: "string" } },
                visualComparisonWithReference: { type: "string" },
                decisionRuleApplied: { type: "string" }
              }
            },
            status: { type: "string", enum: ["answered", "needs_review"] }
          }
        }
      }
    }
  }
} as const;

const QUESTION_UNDERSTANDING_SCHEMA = {
  name: "new_audit_question_understanding",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["questionUnderstanding"],
    properties: {
      questionUnderstanding: ANALYZE_VISUAL_SCHEMA.schema.properties.questionUnderstanding
    }
  }
} as const;

const STORE_ANALYSIS_SCHEMA = {
  name: "new_audit_store_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "knowledgeBase",
      "perPhotoAnalysis",
      "confirmedProducts",
      "confirmedBrands",
      "visibleTexts",
      "shelfSections",
      "uncertainties"
    ],
    properties: {
      knowledgeBase: ANALYZE_VISUAL_SCHEMA.schema.properties.knowledgeBase,
      perPhotoAnalysis: ANALYZE_VISUAL_SCHEMA.schema.properties.perPhotoAnalysis,
      confirmedProducts: { type: "array", items: { type: "string" } },
      confirmedBrands: { type: "array", items: { type: "string" } },
      visibleTexts: { type: "array", items: { type: "string" } },
      shelfSections: { type: "array", items: { type: "string" } },
      uncertainties: { type: "array", items: { type: "string" } }
    }
  }
} as const;

const ANSWER_QUESTIONS_SCHEMA = {
  name: "new_audit_answer_questions",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["questionResults"],
    properties: {
      questionResults: ANALYZE_VISUAL_SCHEMA.schema.properties.questionResults
    }
  }
} as const;

const SYSTEM_PROMPT = `Eres un analista visual experto en auditorias retail.

Recibiras en una sola corrida:
- fotos reales de tienda
- imagenes de referencia de preguntas
- texto opcional de preguntas
- instrucciones generales
- instrucciones especificas por pregunta

Tu trabajo es:
ETAPA 1. Analizar primero cada pregunta activa y su imagen de referencia para construir un Question Understanding completo.
ETAPA 2. Analizar las fotos reales de tienda usando ese Question Understanding como filtro obligatorio antes de responder.

Reglas obligatorias:
- No inventar productos.
- No inventar marcas.
- No afirmes categorias, usos o segmentos de producto solo por apariencia visual.
- Solo puedes afirmar un producto, categoria o marca si hay al menos una de estas evidencias: texto visible, marca visible o producto claramente reconocible con alta certeza.
- Si la identificacion depende de una inferencia visual debil, responde con la opcion equivalente a "No puedo responder" y reduce la confianza.
- No responder SI si no hay evidencia visual clara.
- Debes elegir una respuesta usando unicamente una opcion que exista en expectedOptions de esa pregunta.
- Nunca respondas una opcion que no exista en expectedOptions.
- Si expectedOptions contiene un texto largo, debes devolver exactamente ese texto.
- Debes usar la imagen de referencia de cada pregunta para entender que buscar. No es opcional.
- La imagen de referencia SOLO sirve para entender que buscar. Nunca puede contar como evidencia de presencia en tienda.
- referenceImages = ejemplos y criterios. storePhotos = evidencia real de tienda.
- Antes de responder SI o NO, debes pasar el presence gate: confirmar que el target visual de la pregunta aparece claramente en la foto real.
- Para cada afirmacion de presencia en tienda debes citar targetEvidence con sourceType="storePhoto", storePhotoIndex y detail visible en foto real.
- Si la evidencia proviene de referenceImage, no puede contar como producto detectado en tienda, no puede justificar targetVisible=true y no puede justificar SI o NO.
- Si targetVisible es false o no puedes confirmarlo claramente, debes elegir la opcion equivalente a "No puedo responder" o "No existe el producto" y NO evaluar successCriteria/failureCriteria.
- Si el producto o marca objetivo no aparece visible, no respondas NO por ausencia simple si existe una opcion equivalente a "No puedo responder", "No existe el producto" o "No puedo responder / No existe el producto". Debes elegir esa opcion equivalente.
- Usa NO solo cuando la pregunta exige negar una condicion visual y existe evidencia suficiente para negarla sobre un producto o marca visible.
- Si falta evidencia, elige la opcion equivalente disponible a "No puedo responder".
- Si la evidencia es limitada o ambigua, usar status "needs_review".
- Cada respuesta debe explicar por que.
- Cada respuesta debe indicar que fotos reales de tienda uso.
- Cada respuesta debe listar evidencia observada.
- Para cada pregunta debes devolver tambien visualDiagnostic con:
  - whatTheQuestionAsks
  - requiredEvidence
  - evidenceFound
  - evidenceMissing
  - visualComparisonWithReference
  - decisionRuleApplied
- Si respondes "No puedo responder", evidenceMissing y decisionRuleApplied deben explicar exactamente que falta: por ejemplo producto no visible, foto borrosa, gondola incompleta, falta color, falta orden izquierda-derecha, referencia no coincide o resolucion insuficiente.
- No uses "No puedo responder" por conservadurismo automatico. Si la evidencia visible permite concluir SI, responde SI. Si la evidencia visible permite concluir NO, responde NO.
- Las instrucciones generales mandan sobre la forma de decidir.
- Las instrucciones especificas ayudan a cada pregunta.
- Debes responder solo las preguntas activas/cargadas recibidas en esta corrida.
- No hables de navegacion, autofill ni worker.

Devuelve solo JSON valido.`;

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeOptionLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function classifyOption(value: string) {
  const normalized = normalizeOptionLabel(value);

  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("no puedo responder") ||
    normalized.includes("no existe el producto") ||
    normalized.includes("ns/nc") ||
    normalized.includes("no se puede responder") ||
    normalized.includes("no visible") ||
    normalized.includes("no se observa")
  ) {
    return "unknown";
  }

  if (normalized === "si" || normalized === "sí" || normalized.startsWith("si ") || normalized.startsWith("sí ")) {
    return "yes";
  }

  if (normalized === "no" || normalized.startsWith("no ")) {
    return "no";
  }

  return "unknown";
}

function chooseExpectedOption(expectedOptions: string[], rawAnswer: string, reasoning: string, evidence: string[]) {
  const cleanedOptions = expectedOptions.filter((option) => option.trim().length > 0);
  if (cleanedOptions.length === 0) {
    return rawAnswer || "No puedo responder";
  }

  const exactMatch = cleanedOptions.find((option) => normalizeOptionLabel(option) === normalizeOptionLabel(rawAnswer));
  if (exactMatch) {
    return exactMatch;
  }

  const answerCategory = classifyOption(rawAnswer);
  const optionByCategory = (category: "yes" | "no" | "unknown") =>
    cleanedOptions.find((option) => classifyOption(option) === category);

  const normalizedReasoning = normalizeOptionLabel(`${reasoning} ${(evidence ?? []).join(" ")}`);
  const suggestsMissingProduct =
    normalizedReasoning.includes("no visible") ||
    normalizedReasoning.includes("no se observa") ||
    normalizedReasoning.includes("no aparece") ||
    normalizedReasoning.includes("ausente") ||
    normalizedReasoning.includes("producto no encontrado") ||
    normalizedReasoning.includes("marca no encontrada") ||
    normalizedReasoning.includes("no existe el producto");

  if (suggestsMissingProduct) {
    return optionByCategory("unknown") ?? optionByCategory(answerCategory) ?? cleanedOptions[0];
  }

  return optionByCategory(answerCategory) ?? optionByCategory("unknown") ?? cleanedOptions[0];
}

function normalizeResponse(payload: VisualAnalysisResponse, expectedOptionsByQuestionId: Map<number, string[]>): VisualAnalysisResponse {
  const fallbackAnswerForQuestion = (questionId: number) =>
    chooseExpectedOption(
      expectedOptionsByQuestionId.get(questionId) ?? [],
      "No puedo responder",
      "La evidencia de target no proviene de una foto real de tienda.",
      []
    );

  return {
    questionUnderstanding: (payload.questionUnderstanding ?? []).map((item) => ({
      questionId: item.questionId,
      physicalNumber: item.physicalNumber ?? "",
      questionText: item.questionText ?? "",
      expectedOptions: item.expectedOptions ?? [],
      targetBrand: item.targetBrand ?? [],
      targetProduct: item.targetProduct ?? [],
      targetVariants: item.targetVariants ?? [],
      targetCategory: item.targetCategory ?? [],
      visualCuesFromReference: item.visualCuesFromReference ?? [],
      successCriteria: item.successCriteria ?? [],
      failureCriteria: item.failureCriteria ?? [],
      noAnswerCriteria: item.noAnswerCriteria ?? [],
      optionMapping: (item.optionMapping ?? []).map((mapping) => ({
        option: mapping.option ?? "",
        meaning: mapping.meaning ?? ""
      }))
    })),
    knowledgeBase: {
      summary: payload.knowledgeBase.summary ?? "",
      brandsDetected: payload.knowledgeBase.brandsDetected ?? [],
      productsDetected: payload.knowledgeBase.productsDetected ?? [],
      productsAbsent: payload.knowledgeBase.productsAbsent ?? [],
      categoriesDetected: payload.knowledgeBase.categoriesDetected ?? [],
      sectionsDetected: payload.knowledgeBase.sectionsDetected ?? [],
      orderingDetected: payload.knowledgeBase.orderingDetected ?? [],
      shelfLocations: payload.knowledgeBase.shelfLocations ?? [],
      signageDetected: payload.knowledgeBase.signageDetected ?? [],
      visiblePrices: payload.knowledgeBase.visiblePrices ?? [],
      promotionsDetected: payload.knowledgeBase.promotionsDetected ?? [],
      facingDisplaySignals: payload.knowledgeBase.facingDisplaySignals ?? [],
      relevantVisualSignals: payload.knowledgeBase.relevantVisualSignals ?? [],
      uncertainties: payload.knowledgeBase.uncertainties ?? []
    },
    perPhotoAnalysis: (payload.perPhotoAnalysis ?? []).map((photo) => ({
      photoIndex: photo.photoIndex,
      brandsDetected: photo.brandsDetected ?? [],
      productsDetected: photo.productsDetected ?? [],
      sectionsDetected: photo.sectionsDetected ?? [],
      observations: photo.observations ?? [],
      confidence: clampConfidence(photo.confidence)
    })),
    questionResults: (payload.questionResults ?? []).map((question) => {
      const expectedOptions = expectedOptionsByQuestionId.get(question.questionId) ?? [];
      const normalizedTargetEvidence: VisualQuestionResult["targetEvidence"] = (question.targetEvidence ?? []).map((evidence) => ({
        sourceType: evidence.sourceType === "storePhoto" ? ("storePhoto" as const) : ("referenceImage" as const),
        storePhotoIndex: typeof evidence.storePhotoIndex === "number" ? evidence.storePhotoIndex : undefined,
        detail: evidence.detail ?? ""
      }));
      const hasStorePhotoEvidence = normalizedTargetEvidence.some(
        (evidence) => evidence.sourceType === "storePhoto" && typeof evidence.storePhotoIndex === "number"
      );
      const sanitizedTargetVisible = Boolean(question.targetVisible) && hasStorePhotoEvidence;
      const sanitizedTargetMatchConfidence = sanitizedTargetVisible
        ? clampConfidence(question.targetMatchConfidence)
        : Math.min(0.55, clampConfidence(question.targetMatchConfidence || 0.55));
      const fallbackAnswer = fallbackAnswerForQuestion(question.questionId);
      const detailedMissingEvidence = Array.from(
        new Set(
          [
            ...(question.visualDiagnostic?.evidenceMissing ?? []),
            ...(question.evidence ?? []),
            question.reasoning ?? ""
          ]
            .map((item) => item.trim())
            .filter(Boolean)
        )
      );
      const sanitizedAnswer = sanitizedTargetVisible
        ? chooseExpectedOption(expectedOptions, question.answer, question.reasoning ?? "", question.evidence ?? [])
        : fallbackAnswer;
      const sanitizedReasoning = sanitizedTargetVisible
        ? question.reasoning ?? ""
        : question.reasoning?.trim() ||
          "No se pudo confirmar el target en fotos reales de tienda. La referencia de la pregunta no cuenta como evidencia de presencia.";
      const sanitizedEvidence = sanitizedTargetVisible
        ? question.evidence ?? []
        : detailedMissingEvidence.length > 0
          ? detailedMissingEvidence
          : ["La evidencia disponible no proviene de una foto real de tienda."];
      const sanitizedVisualDiagnostic = {
        whatTheQuestionAsks: question.visualDiagnostic?.whatTheQuestionAsks ?? "",
        requiredEvidence: question.visualDiagnostic?.requiredEvidence ?? [],
        evidenceFound:
          (question.visualDiagnostic?.evidenceFound ?? []).length > 0
            ? question.visualDiagnostic?.evidenceFound ?? []
            : (question.evidence ?? []).filter(Boolean),
        evidenceMissing: sanitizedTargetVisible
          ? question.visualDiagnostic?.evidenceMissing ?? []
          : detailedMissingEvidence.length > 0
            ? detailedMissingEvidence
            : ["No se pudo confirmar el target en una foto real de tienda."],
        visualComparisonWithReference: sanitizedTargetVisible
          ? question.visualDiagnostic?.visualComparisonWithReference ?? ""
          : question.visualDiagnostic?.visualComparisonWithReference?.trim() ||
            "La referencia sirve como guia, pero no hubo evidencia suficiente en la foto real para confirmar el target.",
        decisionRuleApplied: sanitizedTargetVisible
          ? question.visualDiagnostic?.decisionRuleApplied ?? ""
          : question.visualDiagnostic?.decisionRuleApplied?.trim() ||
            "Se aplico la regla de 'No puedo responder' porque falta evidencia observable en foto real de tienda."
      };
      const sanitizedStatus = sanitizedTargetVisible
        ? question.status === "answered" || question.status === "needs_review"
          ? question.status
          : clampConfidence(question.confidence) >= 0.5
            ? "answered"
            : "needs_review"
        : "needs_review";

      return {
        questionId: question.questionId,
        questionText: question.questionText ?? "",
        targetVisible: sanitizedTargetVisible,
        targetMatchConfidence: sanitizedTargetMatchConfidence,
        targetEvidence: normalizedTargetEvidence,
        answer: sanitizedAnswer,
        confidence: sanitizedTargetVisible
          ? clampConfidence(question.confidence)
          : Math.min(0.55, clampConfidence(question.confidence || 0.55)),
        reasoning: sanitizedReasoning,
        storePhotosUsed: question.storePhotosUsed ?? [],
        evidence: sanitizedEvidence,
        visualDiagnostic: sanitizedVisualDiagnostic,
        status: sanitizedStatus
      };
    })
  };
}

function normalizeKnowledgeBase(payload: VisualKnowledgeBase): VisualKnowledgeBase {
  return {
    summary: payload.summary ?? "",
    brandsDetected: payload.brandsDetected ?? [],
    productsDetected: payload.productsDetected ?? [],
    productsAbsent: payload.productsAbsent ?? [],
    categoriesDetected: payload.categoriesDetected ?? [],
    sectionsDetected: payload.sectionsDetected ?? [],
    orderingDetected: payload.orderingDetected ?? [],
    shelfLocations: payload.shelfLocations ?? [],
    signageDetected: payload.signageDetected ?? [],
    visiblePrices: payload.visiblePrices ?? [],
    promotionsDetected: payload.promotionsDetected ?? [],
    facingDisplaySignals: payload.facingDisplaySignals ?? [],
    relevantVisualSignals: payload.relevantVisualSignals ?? [],
    uncertainties: payload.uncertainties ?? []
  };
}

function normalizePerPhotoAnalysis(items: VisualPerPhotoAnalysis[]) {
  return (items ?? []).map((photo) => ({
    photoIndex: photo.photoIndex,
    brandsDetected: photo.brandsDetected ?? [],
    productsDetected: photo.productsDetected ?? [],
    sectionsDetected: photo.sectionsDetected ?? [],
    observations: photo.observations ?? [],
    confidence: clampConfidence(photo.confidence)
  }));
}

function normalizeQuestionResults(
  items: VisualQuestionResult[],
  expectedOptionsByQuestionId: Map<number, string[]>
) {
  const wrapped = normalizeResponse(
    {
      questionUnderstanding: [],
      knowledgeBase: buildEmptyKnowledgeBase(),
      perPhotoAnalysis: [],
      questionResults: items
    },
    expectedOptionsByQuestionId
  );

  return wrapped.questionResults;
}

function resolveStorePhotoUrl(photo: VisualStorePhotoInput) {
  return photo.url || photo.href || photo.previewUrl || "";
}

function resolveReferenceImage(question: VisualQuestionInput) {
  return question.referenceImageDataUrl || question.referenceImage || question.referenceImageUrl || "";
}

export function validateVisualAnalysisInput(input: {
  storePhotos?: VisualStorePhotoInput[];
  projectQuestions?: VisualQuestionInput[];
  generalInstructions?: string;
}) {
  const storePhotos = Array.isArray(input.storePhotos) ? input.storePhotos : [];
  const projectQuestions = Array.isArray(input.projectQuestions) ? input.projectQuestions : [];
  const generalInstructions = input.generalInstructions?.trim() ?? "";
  const activeQuestions = getActiveQuestions(projectQuestions);
  const storePhotosWithSource = storePhotos.filter((photo) => Boolean(resolveStorePhotoUrl(photo)));
  const questionsMissingReference = activeQuestions.filter((question) => !resolveReferenceImage(question));
  const referenceCount = activeQuestions.filter((question) => Boolean(resolveReferenceImage(question))).length;

  if (storePhotos.length === 0) {
    throw new Error("MISSING_STORE_PHOTOS");
  }

  if (storePhotosWithSource.length === 0) {
    throw new Error("STORE_PHOTOS_WITHOUT_USABLE_URL");
  }

  if (projectQuestions.length === 0) {
    throw new Error("MISSING_PROJECT_QUESTIONS");
  }

  if (activeQuestions.length === 0) {
    throw new Error("NO_ACTIVE_VISUAL_QUESTIONS");
  }

  if (questionsMissingReference.length > 0) {
    throw new Error(
      `MISSING_REFERENCE_IMAGE_FOR_QUESTION_IDS:${questionsMissingReference.map((question) => question.id).join(",")}`
    );
  }

  if (!generalInstructions) {
    throw new Error("MISSING_GENERAL_INSTRUCTIONS");
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  return {
    storePhotos: storePhotosWithSource,
    projectQuestions,
    generalInstructions,
    activeQuestions,
    referenceCount
  };
}

function buildFallbackQuestionResult(question: VisualQuestionInput, reason: string): VisualQuestionResult {
  return {
    questionId: question.id,
    questionText: question.text ?? "",
    targetVisible: false,
    targetMatchConfidence: 0.35,
    targetEvidence: [],
    answer: chooseExpectedOption(
      question.expectedOptions,
      "No puedo responder",
      reason,
      ["No hay evidencia visual suficiente para responder con certeza."]
    ),
    confidence: 0.35,
    reasoning: reason,
    storePhotosUsed: [],
    evidence: ["No hay evidencia visual suficiente en las fotos reales para una respuesta concluyente."],
    visualDiagnostic: {
      whatTheQuestionAsks: question.text ?? "",
      requiredEvidence: [],
      evidenceFound: [],
      evidenceMissing: ["No hay evidencia visual suficiente en las fotos reales de tienda."],
      visualComparisonWithReference: "No fue posible completar la comparacion visual con la referencia.",
      decisionRuleApplied: "Se aplico 'No puedo responder' por falta de evidencia suficiente."
    },
    status: "needs_review"
  };
}

export async function runNewAuditVisualAnalysis(input: {
  storePhotos: VisualStorePhotoInput[];
  projectQuestions: VisualQuestionInput[];
  generalInstructions: string;
}) {
  const validated = validateVisualAnalysisInput(input);

  const client = getOpenAIClient();
  const imageInputs: ImageInput[] = [];
  const activeQuestions = validated.activeQuestions;
  console.log(
    "QUESTION_COUNT",
    activeQuestions.length
  );
  console.log("QUESTION_UNDERSTANDING_STARTED");

  imageInputs.push({
    type: "text",
    text: `Instrucciones generales del proyecto:\n${validated.generalInstructions || "Sin instrucciones generales."}`
  });
  imageInputs.push({
    type: "text",
    text: "referenceImages = ejemplos y criterios de busqueda. Nunca cuentan como evidencia de presencia en tienda."
  });
  imageInputs.push({
    type: "text",
    text: "storePhotos = unica evidencia real de tienda. KnowledgeBase.productsDetected y targetVisible solo pueden construirse desde storePhotos."
  });

  imageInputs.push({
    type: "text",
    text: `Preguntas del proyecto:\n${activeQuestions
      .map(
        (question) =>
          `Pregunta ${question.id}: numero_fisico=${question.physicalNumber || ""} | texto=${question.text || "sin texto manual"} | instrucciones especificas=${
            question.specificInstructions || "sin instrucciones especificas"
          } | opciones_validas=${question.expectedOptions.join(" | ")}`
      )
      .join("\n")}`
  });

  for (const photo of validated.storePhotos) {
    const photoUrl = resolveStorePhotoUrl(photo);
    if (!photoUrl) {
      continue;
    }

    imageInputs.push({
      type: "text",
      text: `Foto real de tienda ${photo.index}. Fuente=${photo.source || "survey"}. Usa este numero exactamente al completar storePhotosUsed. Contexto visible: ${
        photo.text || "sin texto auxiliar"
      }`
    });
    imageInputs.push({
      type: "image_url",
      image_url: {
        url: photoUrl
      }
    });
  }

  for (const question of activeQuestions) {
    const referenceUrl = resolveReferenceImage(question);
    if (!referenceUrl) {
      continue;
    }

    imageInputs.push({
      type: "text",
      text: `Imagen de referencia de la pregunta ${question.id}. Usala como guia visual principal para resolver esta pregunta.`
    });
    imageInputs.push({
      type: "image_url",
      image_url: {
        url: referenceUrl
      }
    });
  }

  console.log("OPENAI_REQUEST_START");
  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: ANALYZE_VISUAL_SCHEMA
    },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Haz una sola evaluacion visual profunda por corrida. Preguntas activas en esta corrida: ${activeQuestions.length}. ETAPA 1: construye questionUnderstanding para cada pregunta activa usando su texto, expectedOptions, instrucciones especificas e imagen de referencia. Extrae targetBrand, targetProduct, targetVariants, targetCategory, visualCuesFromReference, successCriteria, failureCriteria, noAnswerCriteria y optionMapping. ETAPA 2: analiza las fotos reales de tienda. Para cada pregunta, primero decide targetVisible, targetMatchConfidence y targetEvidence. Antes de responder, completa visualDiagnostic con whatTheQuestionAsks, requiredEvidence, evidenceFound, evidenceMissing, visualComparisonWithReference y decisionRuleApplied. Si targetVisible es false o ambiguo, responde usando la opcion equivalente a "No puedo responder" o "No existe el producto" y explica exactamente que falta: producto no visible, foto borrosa, gondola incompleta, falta color, falta orden izquierda-derecha, referencia no coincide o resolucion insuficiente. Solo si targetVisible es true y claro, evalúa la condicion y responde con una opcion exacta de expectedOptions. No afirmes categorias como tinturas, cuidado masculino u otras si no hay texto visible, marca visible o reconocimiento visual altamente confiable. Si la evidencia visible permite SI o NO, debes usar SI o NO y justificar por que.`
          },
          ...imageInputs
        ]
      }
    ]
  });
  console.log("OPENAI_RESPONSE_RECEIVED");

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("INVALID_VISUAL_ANALYSIS_RESPONSE");
  }

  let parsed: VisualAnalysisResponse;

  try {
    parsed = JSON.parse(rawContent) as VisualAnalysisResponse;
  } catch {
    throw new Error("INVALID_VISUAL_ANALYSIS_RESPONSE");
  }

  console.log("QUESTION_UNDERSTANDING_COMPLETE", parsed.questionUnderstanding?.length ?? 0);
  console.log(
    "REFERENCE_TARGETS_EXTRACTED",
    (parsed.questionUnderstanding ?? []).map((item) => ({
      questionId: item.questionId,
      targetBrand: item.targetBrand ?? [],
      targetProduct: item.targetProduct ?? [],
      visualCuesFromReference: item.visualCuesFromReference ?? []
    }))
  );
  console.log(
    "TARGETS_EXTRACTED",
    (parsed.questionUnderstanding ?? []).map((item) => ({
      questionId: item.questionId,
      targetBrand: item.targetBrand ?? [],
      targetProduct: item.targetProduct ?? [],
      targetCategory: item.targetCategory ?? []
    }))
  );
  console.log("STORE_VISUAL_ANALYSIS_STARTED");
  console.log("STORE_PRODUCTS_CONFIRMED", {
    knowledgeBaseProductsDetected: parsed.knowledgeBase?.productsDetected ?? [],
    perPhotoProductsDetected: (parsed.perPhotoAnalysis ?? []).map((photo) => ({
      photoIndex: photo.photoIndex,
      productsDetected: photo.productsDetected ?? []
    }))
  });
  console.log("QUESTION_RESULTS_COUNT", parsed.questionResults?.length ?? 0);
  console.log(
    "QUESTION_IDS_RETURNED",
    (parsed.questionResults ?? []).map((question) => question.questionId)
  );
  console.log(
    "TARGET_MATCH_RESULTS",
    (parsed.questionResults ?? []).map((question) => ({
      questionId: question.questionId,
      targetVisible: question.targetVisible,
      targetMatchConfidence: question.targetMatchConfidence
    }))
  );
  console.log(
    "TARGET_EVIDENCE_SOURCE_BY_QUESTION",
    (parsed.questionResults ?? []).map((question) => ({
      questionId: question.questionId,
      targetEvidence: question.targetEvidence ?? []
    }))
  );
  console.log("MAPPING_START");
  const normalized = normalizeResponse(
    parsed,
    new Map(activeQuestions.map((question) => [question.id, question.expectedOptions]))
  );
  const normalizedQuestionIds = new Set(normalized.questionResults.map((question) => question.questionId));
  const missingResults = activeQuestions
    .filter((question) => !normalizedQuestionIds.has(question.id))
    .map((question) =>
      buildFallbackQuestionResult(
        question,
        "No se recibio resultado del modelo para esta pregunta. Se requiere revision manual."
      )
    );
  console.log("MAPPING_COMPLETE", normalized.questionResults.map((question) => question.questionId));

  return {
    ...normalized,
    questionResults: [...normalized.questionResults, ...missingResults]
  };
}

function getActiveQuestions(projectQuestions: VisualQuestionInput[]) {
  return projectQuestions.filter(
    (question) =>
      Boolean(question.text?.trim()) ||
      Boolean(question.specificInstructions?.trim()) ||
      Boolean(resolveReferenceImage(question))
  );
}

function buildEmptyKnowledgeBase(): VisualKnowledgeBase {
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
    uncertainties: []
  };
}

async function parseOpenAIJson<T>(input: {
  model: string;
  schema: typeof QUESTION_UNDERSTANDING_SCHEMA | typeof STORE_ANALYSIS_SCHEMA | typeof ANSWER_QUESTIONS_SCHEMA;
  systemPrompt: string;
  userContent: ImageInput[];
}) {
  const client = getOpenAIClient();
  console.log("OPENAI_REQUEST_START");
  const response = await client.chat.completions.create({
    model: input.model,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: input.schema
    },
    messages: [
      {
        role: "system",
        content: input.systemPrompt
      },
      {
        role: "user",
        content: input.userContent
      }
    ]
  });
  console.log("OPENAI_RESPONSE_RECEIVED");

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("INVALID_VISUAL_ANALYSIS_RESPONSE");
  }

  try {
    return JSON.parse(rawContent) as T;
  } catch {
    throw new Error("INVALID_VISUAL_ANALYSIS_RESPONSE");
  }
}

export async function runAnalyzeQuestionBank(input: {
  projectQuestions: VisualQuestionInput[];
  generalInstructions: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  const activeQuestions = getActiveQuestions(input.projectQuestions);
  console.log("QUESTION_UNDERSTANDING_STARTED");
  console.log("QUESTION_COUNT", activeQuestions.length);

  const content: ImageInput[] = [
    {
      type: "text",
      text: `Instrucciones generales del proyecto:\n${input.generalInstructions || "Sin instrucciones generales."}`
    },
    {
      type: "text",
      text:
        `ETAPA 1 solamente. Construye questionUnderstanding usando las preguntas activas y sus referenceImages. ` +
        `La referenceImage sirve solo para entender qué buscar, criterios y optionMapping. No evalúes tienda ni presencia real.`
    }
  ];

  for (const question of activeQuestions) {
    content.push({
      type: "text",
      text:
        `Pregunta ${question.id}: numero_fisico=${question.physicalNumber || ""} | texto=${question.text || "sin texto manual"} | ` +
        `instrucciones_especificas=${question.specificInstructions || "sin instrucciones"} | opciones_validas=${question.expectedOptions.join(" | ")}`
    });
    const referenceUrl = resolveReferenceImage(question);
    if (referenceUrl) {
      content.push({
        type: "text",
        text: `ReferenceImage de la pregunta ${question.id}. Usala solo para extraer targetBrand, targetProduct, targetVariants, visualCuesFromReference, successCriteria, failureCriteria, noAnswerCriteria y optionMapping.`
      });
      content.push({
        type: "image_url",
        image_url: {
          url: referenceUrl
        }
      });
    }
  }

  const parsed = await parseOpenAIJson<{ questionUnderstanding: VisualQuestionUnderstanding[] }>({
    model: "gpt-4.1-mini",
    schema: QUESTION_UNDERSTANDING_SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    userContent: content
  });

  const questionMap = new Map(activeQuestions.map((question) => [question.id, question]));
  const questionUnderstanding = (parsed.questionUnderstanding ?? []).map((item) => ({
    questionId: item.questionId,
    physicalNumber: item.physicalNumber ?? questionMap.get(item.questionId)?.physicalNumber ?? "",
    questionText: item.questionText ?? questionMap.get(item.questionId)?.text ?? "",
    expectedOptions: item.expectedOptions ?? questionMap.get(item.questionId)?.expectedOptions ?? [],
    targetBrand: item.targetBrand ?? [],
    targetProduct: item.targetProduct ?? [],
    targetVariants: item.targetVariants ?? [],
    targetCategory: item.targetCategory ?? [],
    visualCuesFromReference: item.visualCuesFromReference ?? [],
    successCriteria: item.successCriteria ?? [],
    failureCriteria: item.failureCriteria ?? [],
    noAnswerCriteria: item.noAnswerCriteria ?? [],
    optionMapping: (item.optionMapping ?? []).map((mapping) => ({
      option: mapping.option ?? "",
      meaning: mapping.meaning ?? ""
    }))
  }));

  console.log("QUESTION_UNDERSTANDING_COMPLETE", questionUnderstanding.length);
  console.log(
    "REFERENCE_TARGETS_EXTRACTED",
    questionUnderstanding.map((item) => ({
      questionId: item.questionId,
      targetBrand: item.targetBrand,
      targetProduct: item.targetProduct,
      visualCuesFromReference: item.visualCuesFromReference
    }))
  );

  return { questionUnderstanding };
}

export async function runAnalyzeStorePhotos(input: {
  storePhotos: VisualStorePhotoInput[];
  generalInstructions: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  console.log("STORE_VISUAL_ANALYSIS_STARTED");
  console.log("PHOTO_COUNT", input.storePhotos.length);

  const content: ImageInput[] = [
    {
      type: "text",
      text: `Instrucciones generales del proyecto:\n${input.generalInstructions || "Sin instrucciones generales."}`
    },
    {
      type: "text",
      text:
        "ETAPA 2A solamente. Analiza unicamente storePhotos para construir knowledgeBase y perPhotoAnalysis. " +
        "No uses referenceImages ni preguntas como evidencia. confirmedProducts y confirmedBrands deben salir solo de storePhotos."
    }
  ];

  for (const photo of input.storePhotos) {
    const photoUrl = resolveStorePhotoUrl(photo);
    if (!photoUrl) {
      continue;
    }
    content.push({
      type: "text",
      text: `StorePhoto ${photo.index}. Fuente=${photo.source || "survey"}. Contexto visible: ${photo.text || "sin texto auxiliar"}`
    });
    content.push({
      type: "image_url",
      image_url: {
        url: photoUrl
      }
    });
  }

  const parsed = await parseOpenAIJson<VisualStoreAnalysisResponse>({
    model: "gpt-4.1-mini",
    schema: STORE_ANALYSIS_SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    userContent: content
  });

  const normalized: VisualStoreAnalysisResponse = {
    storeVisualMemory: {
      brandsDetected: parsed.knowledgeBase?.brandsDetected ?? [],
      productsDetected: parsed.knowledgeBase?.productsDetected ?? [],
      productsAbsent: parsed.knowledgeBase?.productsAbsent ?? [],
      sectionsDetected: parsed.knowledgeBase?.sectionsDetected ?? [],
      shelfStructure: parsed.shelfSections ?? [],
      orderingDetected: parsed.knowledgeBase?.orderingDetected ?? [],
      signageDetected: parsed.knowledgeBase?.signageDetected ?? [],
      uncertainties: parsed.uncertainties ?? [],
      photoSummaries: (parsed.perPhotoAnalysis ?? []).map((photo) => photo.observations?.join(" | ") ?? "").filter(Boolean)
    },
    knowledgeBase: normalizeKnowledgeBase(parsed.knowledgeBase ?? buildEmptyKnowledgeBase()),
    perPhotoAnalysis: normalizePerPhotoAnalysis(parsed.perPhotoAnalysis ?? []),
    confirmedProducts: parsed.confirmedProducts ?? [],
    confirmedBrands: parsed.confirmedBrands ?? [],
    visibleTexts: parsed.visibleTexts ?? [],
    shelfSections: parsed.shelfSections ?? [],
    uncertainties: parsed.uncertainties ?? []
  };

  console.log("STORE_PRODUCTS_CONFIRMED", {
    knowledgeBaseProductsDetected: normalized.knowledgeBase.productsDetected,
    confirmedProducts: normalized.confirmedProducts,
    confirmedBrands: normalized.confirmedBrands
  });

  return normalized;
}

export async function runAnswerQuestions(input: {
  questionUnderstanding: VisualQuestionUnderstanding[];
  storePhotos: VisualStorePhotoInput[];
  knowledgeBase: VisualKnowledgeBase;
  perPhotoAnalysis?: VisualPerPhotoAnalysis[];
  generalInstructions: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  console.log("QUESTION_COUNT", input.questionUnderstanding.length);
  const content: ImageInput[] = [
    {
      type: "text",
      text: `Instrucciones generales del proyecto:\n${input.generalInstructions || "Sin instrucciones generales."}`
    },
    {
      type: "text",
      text:
        "ETAPA 2B solamente. Usa questionUnderstanding ya preparado y knowledgeBase derivada solo de storePhotos para responder. " +
        "No uses referenceImages como evidencia. Antes de responder cada pregunta, llena visualDiagnostic con whatTheQuestionAsks, requiredEvidence, evidenceFound, evidenceMissing, visualComparisonWithReference y decisionRuleApplied. " +
        "Si no puedes confirmar targetVisible desde storePhotos, responde con la opcion equivalente a 'No puedo responder / No existe el producto' y explica exactamente que falta."
    },
    {
      type: "text",
      text: `QuestionUnderstanding:\n${input.questionUnderstanding
        .map(
          (question) =>
            `Pregunta ${question.questionId}: numero_fisico=${question.physicalNumber} | texto=${question.questionText} | ` +
            `targetBrand=${question.targetBrand.join(", ")} | targetProduct=${question.targetProduct.join(", ")} | ` +
            `targetVariants=${question.targetVariants.join(", ")} | targetCategory=${question.targetCategory.join(", ")} | ` +
            `successCriteria=${question.successCriteria.join(" ; ")} | failureCriteria=${question.failureCriteria.join(" ; ")} | ` +
            `noAnswerCriteria=${question.noAnswerCriteria.join(" ; ")} | opciones=${question.expectedOptions.join(" | ")}`
        )
        .join("\n")}`
    },
    {
      type: "text",
      text:
        `KnowledgeBase desde storePhotos:\n${JSON.stringify(input.knowledgeBase)}\n` +
        "Regla de decision: usa SI cuando la evidencia visible confirme la condicion, usa NO cuando la evidencia visible permita negarla con sustento, y usa No puedo responder solo si falta evidencia especifica. " +
        "Si respondes No puedo responder, evidenceMissing debe nombrar faltantes concretos como producto no visible, foto borrosa, gondola incompleta, falta color, falta orden izquierda-derecha, referencia no coincide o resolucion insuficiente."
    }
  ];

  for (const photo of input.storePhotos) {
    const photoUrl = resolveStorePhotoUrl(photo);
    if (!photoUrl) {
      continue;
    }
    content.push({
      type: "text",
      text: `StorePhoto ${photo.index}. Esta es evidencia real de tienda. Solo esta fuente puede justificar targetVisible=true.`
    });
    content.push({
      type: "image_url",
      image_url: {
        url: photoUrl
      }
    });
  }

  const parsed = await parseOpenAIJson<VisualAnswerQuestionsResponse>({
    model: "gpt-4.1-mini",
    schema: ANSWER_QUESTIONS_SCHEMA,
    systemPrompt: SYSTEM_PROMPT,
    userContent: content
  });

  console.log("QUESTION_RESULTS_RETURNED", parsed.questionResults?.length ?? 0);
  console.log(
    "TARGET_EVIDENCE_SOURCE_BY_QUESTION",
    (parsed.questionResults ?? []).map((question) => ({
      questionId: question.questionId,
      targetEvidence: question.targetEvidence ?? []
    }))
  );

  const expectedOptionsByQuestionId = new Map(
    input.questionUnderstanding.map((question) => [question.questionId, question.expectedOptions])
  );

  return {
    questionResults: normalizeQuestionResults(parsed.questionResults ?? [], expectedOptionsByQuestionId)
  };
}
