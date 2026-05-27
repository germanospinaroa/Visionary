export type QuestionType =
  | "product_presence"
  | "product_location"
  | "shelf_order"
  | "facing_count"
  | "price_validation"
  | "shelf_share"
  | "inventory_presence"
  | "vertical_arrangement"
  | "horizontal_arrangement"
  | "unknown";

export type QuestionRegistryRule = {
  type: QuestionType;
  label: string;
  patterns: string[];
  visualStrategy: string;
  answerStrategy: string;
  requiredEvidence: string[];
  lowCostApproach: string;
  escalationTrigger: string;
};

export const QUESTION_REGISTRY: QuestionRegistryRule[] = [
  {
    type: "product_presence",
    label: "Presencia de producto",
    patterns: ["esta el producto", "se encuentra", "presencia", "visible", "exhibido"],
    visualStrategy: "Buscar producto objetivo por crops, OCR y similitud visual; confirmar por etiqueta o match visual extremadamente fuerte.",
    answerStrategy: "Responder afirmativo solo con confirmacion clara; si no se confirma, forzar no puedo responder.",
    requiredEvidence: ["crop util", "texto legible o match fuerte", "ubicacion general"],
    lowCostApproach: "Primer pase con crops amplios y OCR contextual.",
    escalationTrigger: "Producto pequeno, empaque similar o baja nitidez."
  },
  {
    type: "product_location",
    label: "Ubicacion de producto",
    patterns: ["en que seccion", "ubicado", "donde esta", "anaquel", "mueble"],
    visualStrategy: "Primero confirmar el producto, luego analizar posicion relativa, categoria vecina y seccion visible.",
    answerStrategy: "Si no se confirma el producto o la seccion, no responder de forma negativa; usar no puedo responder.",
    requiredEvidence: ["producto confirmado", "contexto espacial", "seccion o adyacencias"],
    lowCostApproach: "Usar imagen completa para contexto y crops para validacion.",
    escalationTrigger: "Seccion ambigua o multiples zonas parecidas."
  },
  {
    type: "shelf_order",
    label: "Orden de anaquel",
    patterns: ["orden", "antes de", "despues de", "izquierda de", "derecha de"],
    visualStrategy: "Confirmar ambos productos y luego medir relacion horizontal directa.",
    answerStrategy: "No asumir orden si alguno de los productos no se confirma.",
    requiredEvidence: ["dos productos confirmados", "relacion izquierda-derecha", "misma region"],
    lowCostApproach: "Extraer crops solapados del area media.",
    escalationTrigger: "Productos con empaques casi identicos."
  },
  {
    type: "facing_count",
    label: "Conteo de facings",
    patterns: ["cuantos frentes", "facings", "cantidad", "numero de piezas al frente"],
    visualStrategy: "Detectar producto confirmado y contar solo frentes claramente visibles.",
    answerStrategy: "Si el borde del anaquel esta cortado o tapado, no inferir.",
    requiredEvidence: ["producto confirmado", "visibilidad frontal", "limites del anaquel"],
    lowCostApproach: "Recortes verticales y zoom local.",
    escalationTrigger: "Occlusion parcial o multiples filas."
  },
  {
    type: "price_validation",
    label: "Validacion de precio",
    patterns: ["precio", "etiqueta", "ticket", "promocion"],
    visualStrategy: "Buscar region de precio y leer texto con OCR asistido por contexto de producto.",
    answerStrategy: "Si el texto no es legible, no validar el precio.",
    requiredEvidence: ["etiqueta legible", "producto asociado", "valor leido"],
    lowCostApproach: "OCR sobre zonas inferiores y crops de alta nitidez.",
    escalationTrigger: "Texto pequeno o desenfoque."
  },
  {
    type: "shelf_share",
    label: "Participacion en anaquel",
    patterns: ["share", "participacion", "porcentaje de anaquel", "espacio"],
    visualStrategy: "Segmentar visualmente la categoria y estimar proporcion ocupada por la marca.",
    answerStrategy: "Si los limites de categoria no son visibles, marcar no puedo responder.",
    requiredEvidence: ["categoria identificable", "marca identificada", "estimacion espacial"],
    lowCostApproach: "Razonamiento sobre imagen completa con apoyo de crops.",
    escalationTrigger: "Categorias mezcladas o anaquel incompleto."
  },
  {
    type: "inventory_presence",
    label: "Presencia en inventario",
    patterns: ["inventario", "stock", "agotado", "existencia"],
    visualStrategy: "Verificar presencia real del producto y distinguir huecos vs sustitutos.",
    answerStrategy: "Nunca asumir agotado si la foto no cubre toda la zona relevante.",
    requiredEvidence: ["producto confirmado o ausencia comprobable", "zona completa relevante"],
    lowCostApproach: "Analisis por secciones y huecos visibles.",
    escalationTrigger: "Cobertura parcial de la foto."
  },
  {
    type: "vertical_arrangement",
    label: "Acomodo vertical",
    patterns: ["arriba de", "abajo de", "vertical", "sobre", "debajo"],
    visualStrategy: "Confirmar productos y comparar niveles de repisa o columnas.",
    answerStrategy: "Responder solo con referencia vertical clara.",
    requiredEvidence: ["producto confirmado", "referencia vertical", "misma columna o seccion"],
    lowCostApproach: "Recortes altos y segmentacion por filas.",
    escalationTrigger: "Perspectiva inclinada."
  },
  {
    type: "horizontal_arrangement",
    label: "Acomodo horizontal",
    patterns: ["izquierda", "derecha", "horizontal", "alineado"],
    visualStrategy: "Confirmar productos y analizar continuidad lateral.",
    answerStrategy: "No inferir continuidad fuera del crop visible.",
    requiredEvidence: ["producto confirmado", "referencia horizontal", "continuidad visible"],
    lowCostApproach: "Recortes solapados laterales.",
    escalationTrigger: "Panoramica extensa o zonas cortadas."
  }
];

export function classifyQuestion(question: string | null | undefined): QuestionRegistryRule {
  const normalized = (question ?? "").toLowerCase();

  for (const rule of QUESTION_REGISTRY) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule;
    }
  }

  return {
    type: "unknown",
    label: "Desconocida",
    patterns: [],
    visualStrategy: "Analisis conservador centrado en evidencia visible y mapeo estricto a opciones visibles.",
    answerStrategy: "Si falta confirmacion visual suficiente, usar no puedo responder.",
    requiredEvidence: ["producto o atributo confirmado", "evidencia visual trazable"],
    lowCostApproach: "Primer pase general.",
    escalationTrigger: "Toda ambiguedad relevante."
  };
}
