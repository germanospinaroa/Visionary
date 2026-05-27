export const PILOT_BLUEPRINT = {
  operatingModel: {
    name: "Controlled Retail Visual Audit Pilot",
    principle:
      "No es un agente autonomo libre; es un flujo controlado con decisiones auditables y escalado por confianza.",
    goals: [
      "precision primero",
      "respuesta rapida",
      "costo contenido",
      "trazabilidad completa",
      "supervision humana solo donde aporte valor"
    ]
  },
  recommendedStack: {
    dashboard: "Next.js + TailwindCSS",
    automation: "Playwright",
    ai: "OpenAI multimodal con doble etapa",
    storage: "Supabase Postgres + Storage",
    queue: "Inngest para simplicidad operativa en piloto",
    integrations: ["Google Sheets API"]
  },
  modelStrategy: {
    stage1: "gpt-4.1-mini para lectura inicial, clasificacion y primer dictamen",
    stage2:
      "gpt-4.1 solo si hay baja confianza, producto no confirmado, OCR ambiguo o regla espacial compleja",
    reason:
      "Minimiza costo unitario mientras reserva el modelo mas caro para casos de riesgo real."
  },
  precisionRules: [
    "Sin evidencia positiva, nunca responder negativo por defecto.",
    "Producto confirmado solo con etiqueta legible o match visual extremadamente fuerte.",
    "Cada pregunta se analiza aislada, sin memoria de reglas previas.",
    "La respuesta final siempre debe corresponder a una opcion visible.",
    "Toda respuesta debe almacenar imagen, crop, zona, razonamiento y decision del supervisor."
  ],
  rolloutPlan: [
    "Fase 1: piloto controlado con 1 flujo, 1 formulario y validacion humana obligatoria en todos los casos.",
    "Fase 2: autoaprobacion solo para respuestas de alta confianza con evidencia fuerte y tipo de pregunta conocido.",
    "Fase 3: optimizacion por metricas de precision, costo por tienda y tasa de escalamiento."
  ],
  costControls: [
    "Preprocesar una sola vez por imagen: crops, OCR, calidad y zonas candidatas.",
    "Reutilizar la capa de inteligencia visual entre preguntas de la misma tienda.",
    "Escalar al modelo caro solo cuando el supervisor o la confianza lo exijan.",
    "Enviar a revision humana solo casos con valor marginal de precision."
  ]
} as const;
