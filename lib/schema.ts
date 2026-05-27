export const RESPONSE_OPTIONS = ["sí", "no", "no sé"] as const;
export const CONFIDENCE_OPTIONS = ["alta", "media", "baja"] as const;

export type DetectedOption = {
  label: string;
  texto: string;
};

export type RuleSourceKind = "captura" | "contexto_adicional" | "pregunta_manual";

export type RuleSource = {
  regla: string;
  fuente: RuleSourceKind;
};

export type ZoneSearchResult = {
  zona: string;
  producto_detectado: boolean | null;
  confianza: (typeof CONFIDENCE_OPTIONS)[number];
  evidencia: string;
};

export type TargetProductSearch = {
  producto_objetivo: string;
  busqueda_por_zonas: ZoneSearchResult[];
  producto_confirmado: boolean | null;
  mejor_zona_detectada: string;
  ubicacion_en_imagen_principal: string;
};

export type EvidenceTrace = {
  image_asset: string;
  crop_asset: string;
  coordinates: string;
  section: string;
  ocr_evidence: string;
};

export type SupervisorDecision = {
  status: "approve" | "reject" | "force_no_puedo_responder" | "retry_with_new_crops";
  rationale: string;
  hallucination_risk: (typeof CONFIDENCE_OPTIONS)[number];
  requested_action: string;
};

export type ApplicabilityDecision = "aplicar_pregunta" | "no_aplicar_pregunta";

export type ApplicabilityCondition = {
  descripcion: string;
  se_cumple: boolean | null;
  confianza: (typeof CONFIDENCE_OPTIONS)[number];
  evidencia: string;
  decision: ApplicabilityDecision;
};

export type AnalysisResult = {
  respuesta: (typeof RESPONSE_OPTIONS)[number];
  confianza: (typeof CONFIDENCE_OPTIONS)[number];
  pregunta_detectada: string | null;
  tipo_de_pregunta: string;
  estrategia_visual_sugerida: string;
  instrucciones_detectadas: string[];
  aclaraciones_detectadas: string[];
  condiciones_previas: string[];
  fuentes_de_reglas: RuleSource[];
  reglas_descartadas_por_contaminacion: string[];
  condicion_aplicabilidad: ApplicabilityCondition | null;
  target_product_search: TargetProductSearch;
  opciones_detectadas: DetectedOption[];
  criterio_real_de_evaluacion: string;
  analisis_de_aplicabilidad: string;
  conclusion_logica: string;
  respuesta_final_label: string;
  respuesta_final_texto: string;
  razon_de_mapeo: string;
  elemento_buscado: string;
  evidencia_visual: string;
  no_puedo_responder: boolean;
  motivo_no_puedo_responder: string;
  evidencia_trazable: EvidenceTrace;
  decision_supervisor: SupervisorDecision;
  explicacion: string;
  advertencias: string;
};

export type AnalyzeError = {
  error: string;
  detail: string;
};

type LooseAnalysisResult = Partial<Record<keyof AnalysisResult, unknown>>;

export const analysisJsonSchema = {
  name: "visual_analysis_result",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "respuesta",
      "confianza",
      "pregunta_detectada",
      "tipo_de_pregunta",
      "estrategia_visual_sugerida",
      "instrucciones_detectadas",
      "aclaraciones_detectadas",
      "condiciones_previas",
      "fuentes_de_reglas",
      "reglas_descartadas_por_contaminacion",
      "condicion_aplicabilidad",
      "target_product_search",
      "opciones_detectadas",
      "criterio_real_de_evaluacion",
      "analisis_de_aplicabilidad",
      "conclusion_logica",
      "respuesta_final_label",
      "respuesta_final_texto",
      "razon_de_mapeo",
      "elemento_buscado",
      "evidencia_visual",
      "no_puedo_responder",
      "motivo_no_puedo_responder",
      "evidencia_trazable",
      "decision_supervisor",
      "explicacion",
      "advertencias"
    ],
    properties: {
      respuesta: {
        type: "string",
        enum: [...RESPONSE_OPTIONS]
      },
      confianza: {
        type: "string",
        enum: [...CONFIDENCE_OPTIONS]
      },
      pregunta_detectada: {
        anyOf: [
          {
            type: "string"
          },
          {
            type: "null"
          }
        ]
      },
      tipo_de_pregunta: {
        type: "string"
      },
      estrategia_visual_sugerida: {
        type: "string"
      },
      instrucciones_detectadas: {
        type: "array",
        items: {
          type: "string"
        }
      },
      aclaraciones_detectadas: {
        type: "array",
        items: {
          type: "string"
        }
      },
      condiciones_previas: {
        type: "array",
        items: {
          type: "string"
        }
      },
      fuentes_de_reglas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["regla", "fuente"],
          properties: {
            regla: {
              type: "string"
            },
            fuente: {
              type: "string",
              enum: ["captura", "contexto_adicional", "pregunta_manual"]
            }
          }
        }
      },
      reglas_descartadas_por_contaminacion: {
        type: "array",
        items: {
          type: "string"
        }
      },
      condicion_aplicabilidad: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["descripcion", "se_cumple", "confianza", "evidencia", "decision"],
            properties: {
              descripcion: {
                type: "string"
              },
              se_cumple: {
                anyOf: [
                  {
                    type: "boolean"
                  },
                  {
                    type: "null"
                  }
                ]
              },
              confianza: {
                type: "string",
                enum: [...CONFIDENCE_OPTIONS]
              },
              evidencia: {
                type: "string"
              },
              decision: {
                type: "string",
                enum: ["aplicar_pregunta", "no_aplicar_pregunta"]
              }
            }
          },
          {
            type: "null"
          }
        ]
      },
      target_product_search: {
        type: "object",
        additionalProperties: false,
        required: [
          "producto_objetivo",
          "busqueda_por_zonas",
          "producto_confirmado",
          "mejor_zona_detectada",
          "ubicacion_en_imagen_principal"
        ],
        properties: {
          producto_objetivo: {
            type: "string"
          },
          busqueda_por_zonas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["zona", "producto_detectado", "confianza", "evidencia"],
              properties: {
                zona: {
                  type: "string"
                },
                producto_detectado: {
                  anyOf: [
                    {
                      type: "boolean"
                    },
                    {
                      type: "null"
                    }
                  ]
                },
                confianza: {
                  type: "string",
                  enum: [...CONFIDENCE_OPTIONS]
                },
                evidencia: {
                  type: "string"
                }
              }
            }
          },
          producto_confirmado: {
            anyOf: [
              {
                type: "boolean"
              },
              {
                type: "null"
              }
            ]
          },
          mejor_zona_detectada: {
            type: "string"
          },
          ubicacion_en_imagen_principal: {
            type: "string"
          }
        }
      },
      opciones_detectadas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "texto"],
          properties: {
            label: {
              type: "string"
            },
            texto: {
              type: "string"
            }
          }
        }
      },
      criterio_real_de_evaluacion: {
        type: "string"
      },
      analisis_de_aplicabilidad: {
        type: "string"
      },
      conclusion_logica: {
        type: "string"
      },
      respuesta_final_label: {
        type: "string"
      },
      respuesta_final_texto: {
        type: "string"
      },
      razon_de_mapeo: {
        type: "string"
      },
      elemento_buscado: {
        type: "string"
      },
      evidencia_visual: {
        type: "string"
      },
      no_puedo_responder: {
        type: "boolean"
      },
      motivo_no_puedo_responder: {
        type: "string"
      },
      evidencia_trazable: {
        type: "object",
        additionalProperties: false,
        required: ["image_asset", "crop_asset", "coordinates", "section", "ocr_evidence"],
        properties: {
          image_asset: {
            type: "string"
          },
          crop_asset: {
            type: "string"
          },
          coordinates: {
            type: "string"
          },
          section: {
            type: "string"
          },
          ocr_evidence: {
            type: "string"
          }
        }
      },
      decision_supervisor: {
        type: "object",
        additionalProperties: false,
        required: ["status", "rationale", "hallucination_risk", "requested_action"],
        properties: {
          status: {
            type: "string",
            enum: [
              "approve",
              "reject",
              "force_no_puedo_responder",
              "retry_with_new_crops"
            ]
          },
          rationale: {
            type: "string"
          },
          hallucination_risk: {
            type: "string",
            enum: [...CONFIDENCE_OPTIONS]
          },
          requested_action: {
            type: "string"
          }
        }
      },
      explicacion: {
        type: "string"
      },
      advertencias: {
        type: "string"
      }
    }
  },
  strict: true
} as const;

function isResponseOption(value: unknown): value is AnalysisResult["respuesta"] {
  return typeof value === "string" && RESPONSE_OPTIONS.includes(value as AnalysisResult["respuesta"]);
}

function isConfidenceOption(value: unknown): value is AnalysisResult["confianza"] {
  return typeof value === "string" && CONFIDENCE_OPTIONS.includes(value as AnalysisResult["confianza"]);
}

function isApplicabilityDecision(value: unknown): value is ApplicabilityDecision {
  return value === "aplicar_pregunta" || value === "no_aplicar_pregunta";
}

function isRuleSourceKind(value: unknown): value is RuleSourceKind {
  return (
    value === "captura" || value === "contexto_adicional" || value === "pregunta_manual"
  );
}

function normalizeText(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`El campo "${field}" no es texto válido.`);
  }

  return value.trim();
}

function normalizeStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`El campo "${field}" no es una lista válida.`);
  }

  return value.map((item, index) => normalizeText(item, `${field}[${index}]`));
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error('El campo "opciones_detectadas" no es una lista válida.');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`El campo "opciones_detectadas[${index}]" no es un objeto válido.`);
    }

    const option = item as Partial<DetectedOption>;

    return {
      label: normalizeText(option.label, `opciones_detectadas[${index}].label`),
      texto: normalizeText(option.texto, `opciones_detectadas[${index}].texto`)
    };
  });
}

function normalizeApplicabilityCondition(value: unknown): ApplicabilityCondition | null {
  if (value == null) {
    return null;
  }

  if (!value || typeof value !== "object") {
    throw new Error('El campo "condicion_aplicabilidad" no es un objeto válido.');
  }

  const data = value as Partial<ApplicabilityCondition>;

  if (!isConfidenceOption(data.confianza)) {
    throw new Error('El campo "condicion_aplicabilidad.confianza" no es válido.');
  }

  if (!isApplicabilityDecision(data.decision)) {
    throw new Error('El campo "condicion_aplicabilidad.decision" no es válido.');
  }

  if (data.se_cumple !== true && data.se_cumple !== false && data.se_cumple !== null) {
    throw new Error('El campo "condicion_aplicabilidad.se_cumple" no es válido.');
  }

  return {
    descripcion: normalizeText(data.descripcion, "condicion_aplicabilidad.descripcion"),
    se_cumple: data.se_cumple,
    confianza: data.confianza,
    evidencia: normalizeText(data.evidencia, "condicion_aplicabilidad.evidencia"),
    decision: data.decision
  };
}

function normalizeRuleSources(value: unknown): RuleSource[] {
  if (!Array.isArray(value)) {
    throw new Error('El campo "fuentes_de_reglas" no es una lista válida.');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`El campo "fuentes_de_reglas[${index}]" no es un objeto válido.`);
    }

    const source = item as Partial<RuleSource>;

    if (!isRuleSourceKind(source.fuente)) {
      throw new Error(`El campo "fuentes_de_reglas[${index}].fuente" no es válido.`);
    }

    return {
      regla: normalizeText(source.regla, `fuentes_de_reglas[${index}].regla`),
      fuente: source.fuente
    };
  });
}

function normalizeTargetProductSearch(value: unknown): TargetProductSearch {
  if (!value || typeof value !== "object") {
    throw new Error('El campo "target_product_search" no es un objeto válido.');
  }

  const data = value as Partial<TargetProductSearch>;

  if (!Array.isArray(data.busqueda_por_zonas)) {
    throw new Error('El campo "target_product_search.busqueda_por_zonas" no es válido.');
  }

  const busquedaPorZonas = data.busqueda_por_zonas.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(
        `El campo "target_product_search.busqueda_por_zonas[${index}]" no es válido.`
      );
    }

    const zone = item as Partial<ZoneSearchResult>;

    if (!isConfidenceOption(zone.confianza)) {
      throw new Error(
        `El campo "target_product_search.busqueda_por_zonas[${index}].confianza" no es válido.`
      );
    }

    if (
      zone.producto_detectado !== true &&
      zone.producto_detectado !== false &&
      zone.producto_detectado !== null
    ) {
      throw new Error(
        `El campo "target_product_search.busqueda_por_zonas[${index}].producto_detectado" no es válido.`
      );
    }

    return {
      zona: normalizeText(zone.zona, `target_product_search.busqueda_por_zonas[${index}].zona`),
      producto_detectado: zone.producto_detectado,
      confianza: zone.confianza,
      evidencia: normalizeText(
        zone.evidencia,
        `target_product_search.busqueda_por_zonas[${index}].evidencia`
      )
    };
  });

  if (
    data.producto_confirmado !== true &&
    data.producto_confirmado !== false &&
    data.producto_confirmado !== null
  ) {
    throw new Error('El campo "target_product_search.producto_confirmado" no es válido.');
  }

  return {
    producto_objetivo: normalizeText(
      data.producto_objetivo,
      "target_product_search.producto_objetivo"
    ),
    busqueda_por_zonas: busquedaPorZonas,
    producto_confirmado: data.producto_confirmado,
    mejor_zona_detectada: normalizeText(
      data.mejor_zona_detectada,
      "target_product_search.mejor_zona_detectada"
    ),
    ubicacion_en_imagen_principal: normalizeText(
      data.ubicacion_en_imagen_principal,
      "target_product_search.ubicacion_en_imagen_principal"
    )
  };
}

function normalizeEvidenceTrace(value: unknown): EvidenceTrace {
  if (!value || typeof value !== "object") {
    throw new Error('El campo "evidencia_trazable" no es un objeto válido.');
  }

  const data = value as Partial<EvidenceTrace>;

  return {
    image_asset: normalizeText(data.image_asset, "evidencia_trazable.image_asset"),
    crop_asset: normalizeText(data.crop_asset, "evidencia_trazable.crop_asset"),
    coordinates: normalizeText(data.coordinates, "evidencia_trazable.coordinates"),
    section: normalizeText(data.section, "evidencia_trazable.section"),
    ocr_evidence: normalizeText(data.ocr_evidence, "evidencia_trazable.ocr_evidence")
  };
}

function normalizeSupervisorDecision(value: unknown): SupervisorDecision {
  if (!value || typeof value !== "object") {
    throw new Error('El campo "decision_supervisor" no es un objeto válido.');
  }

  const data = value as Partial<SupervisorDecision>;

  if (
    data.status !== "approve" &&
    data.status !== "reject" &&
    data.status !== "force_no_puedo_responder" &&
    data.status !== "retry_with_new_crops"
  ) {
    throw new Error('El campo "decision_supervisor.status" no es válido.');
  }

  if (!isConfidenceOption(data.hallucination_risk)) {
    throw new Error('El campo "decision_supervisor.hallucination_risk" no es válido.');
  }

  return {
    status: data.status,
    rationale: normalizeText(data.rationale, "decision_supervisor.rationale"),
    hallucination_risk: data.hallucination_risk,
    requested_action: normalizeText(
      data.requested_action,
      "decision_supervisor.requested_action"
    )
  };
}

export function normalizeAnalysisResult(payload: unknown): AnalysisResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("La respuesta del modelo no es un objeto JSON válido.");
  }

  const data = payload as LooseAnalysisResult;

  if (!isResponseOption(data.respuesta)) {
    throw new Error('El campo "respuesta" no contiene uno de los valores permitidos.');
  }

  if (!isConfidenceOption(data.confianza)) {
    throw new Error('El campo "confianza" no contiene uno de los valores permitidos.');
  }

  return {
    respuesta: data.respuesta,
    confianza: data.confianza,
    pregunta_detectada:
      data.pregunta_detectada == null
        ? null
        : normalizeText(data.pregunta_detectada, "pregunta_detectada"),
    tipo_de_pregunta: normalizeText(data.tipo_de_pregunta, "tipo_de_pregunta"),
    estrategia_visual_sugerida: normalizeText(
      data.estrategia_visual_sugerida,
      "estrategia_visual_sugerida"
    ),
    instrucciones_detectadas: normalizeStringArray(
      data.instrucciones_detectadas,
      "instrucciones_detectadas"
    ),
    aclaraciones_detectadas: normalizeStringArray(
      data.aclaraciones_detectadas,
      "aclaraciones_detectadas"
    ),
    condiciones_previas: normalizeStringArray(data.condiciones_previas, "condiciones_previas"),
    fuentes_de_reglas: normalizeRuleSources(data.fuentes_de_reglas),
    reglas_descartadas_por_contaminacion: normalizeStringArray(
      data.reglas_descartadas_por_contaminacion,
      "reglas_descartadas_por_contaminacion"
    ),
    condicion_aplicabilidad:
      data.condicion_aplicabilidad == null
        ? null
        : normalizeApplicabilityCondition(data.condicion_aplicabilidad),
    target_product_search: normalizeTargetProductSearch(data.target_product_search),
    opciones_detectadas: normalizeOptions(data.opciones_detectadas),
    criterio_real_de_evaluacion: normalizeText(
      data.criterio_real_de_evaluacion,
      "criterio_real_de_evaluacion"
    ),
    analisis_de_aplicabilidad: normalizeText(
      data.analisis_de_aplicabilidad,
      "analisis_de_aplicabilidad"
    ),
    conclusion_logica: normalizeText(data.conclusion_logica, "conclusion_logica"),
    respuesta_final_label: normalizeText(data.respuesta_final_label, "respuesta_final_label"),
    respuesta_final_texto: normalizeText(data.respuesta_final_texto, "respuesta_final_texto"),
    razon_de_mapeo: normalizeText(data.razon_de_mapeo, "razon_de_mapeo"),
    elemento_buscado: normalizeText(data.elemento_buscado, "elemento_buscado"),
    evidencia_visual: normalizeText(data.evidencia_visual, "evidencia_visual"),
    no_puedo_responder:
      data.no_puedo_responder === true
        ? true
        : data.no_puedo_responder === false
          ? false
          : (() => {
              throw new Error('El campo "no_puedo_responder" no es válido.');
            })(),
    motivo_no_puedo_responder: normalizeText(
      data.motivo_no_puedo_responder,
      "motivo_no_puedo_responder"
    ),
    evidencia_trazable: normalizeEvidenceTrace(data.evidencia_trazable),
    decision_supervisor: normalizeSupervisorDecision(data.decision_supervisor),
    explicacion: normalizeText(data.explicacion, "explicacion"),
    advertencias:
      typeof data.advertencias === "string" ? data.advertencias.trim() : ""
  };
}
