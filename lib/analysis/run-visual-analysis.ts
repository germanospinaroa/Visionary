import { getOpenAIClient } from "@/lib/openai";
import { analysisJsonSchema, normalizeAnalysisResult } from "@/lib/schema";
import { classifyQuestion } from "@/lib/question-registry";
import {
  assertValidHttpUrl,
  buildMainImageAssets,
  fetchRemoteImage,
  fileToDataUrl
} from "@/lib/image";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/prompt";

type ImageInput =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function shouldEscalate(result: ReturnType<typeof normalizeAnalysisResult>) {
  return (
    result.confianza !== "alta" ||
    result.no_puedo_responder ||
    result.target_product_search.producto_confirmado !== true ||
    result.decision_supervisor.status === "retry_with_new_crops" ||
    result.decision_supervisor.hallucination_risk !== "baja"
  );
}

async function runModelAnalysis({
  model,
  imageInputs,
  manualQuestion,
  additionalContext,
  registryHint,
  escalationLevel
}: {
  model: string;
  imageInputs: ImageInput[];
  manualQuestion: string;
  additionalContext: string;
  registryHint: string;
  escalationLevel: "standard" | "escalated";
}) {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: analysisJsonSchema
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
            text: buildUserPrompt({
              manualQuestion,
              additionalContext,
              registryHint,
              escalationLevel
            })
          },
          ...imageInputs
        ]
      }
    ]
  });

  const rawContent = response.choices[0]?.message?.content;

  if (!rawContent) {
    throw new Error("El modelo no devolvió contenido utilizable.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("La respuesta del modelo no llegó en JSON válido.");
  }

  return normalizeAnalysisResult(parsed);
}

export async function runVisualAnalysis({
  mainImageUrl,
  questionnaireImage,
  questionnaireImageMimeType,
  questionnaireFilename,
  manualQuestion = "",
  additionalContext = "",
  traceContext
}: {
  mainImageUrl: string;
  questionnaireImage: Buffer;
  questionnaireImageMimeType: string;
  questionnaireFilename?: string;
  manualQuestion?: string;
  additionalContext?: string;
  traceContext?: {
    runId?: string;
    currentStep?: string;
    sourceUrl?: string;
    contentType?: string;
  };
}) {
  const normalizedMainImageUrl = assertValidHttpUrl(mainImageUrl.trim());
  const registryRule = classifyQuestion(manualQuestion);

  const file = new File([new Uint8Array(questionnaireImage)], questionnaireFilename ?? "questionnaire.png", {
    type: questionnaireImageMimeType
  });

  const [mainImage, questionnaireDataUrl] = await Promise.all([
    fetchRemoteImage(normalizedMainImageUrl, {
      ...traceContext,
      sourceUrl: normalizedMainImageUrl
    }),
    fileToDataUrl(file)
  ]);

  const mainImageAssets = await buildMainImageAssets(mainImage.buffer, mainImage.mimeType, {
    ...traceContext,
    sourceUrl: normalizedMainImageUrl,
    contentType: mainImage.mimeType
  });

  const imageInputs: ImageInput[] = [
    {
      type: "text",
      text: "Imagen del cuestionario actual:"
    },
    {
      type: "image_url",
      image_url: {
        url: questionnaireDataUrl
      }
    },
    {
      type: "text",
      text:
        "Imagen principal completa y crops ampliados para target_product_search. Usa main_full para contexto global y los crops para confirmar visualmente el producto objetivo pequeño."
    }
  ];

  for (const asset of mainImageAssets) {
    imageInputs.push({
      type: "text",
      text: `${asset.name}: recorte de la imagen principal (${asset.width}x${asset.height}).`
    });
    imageInputs.push({
      type: "image_url",
      image_url: {
        url: asset.dataUrl
      }
    });
  }

  const registryHint = [
    `tipo=${registryRule.type}`,
    `estrategia_visual=${registryRule.visualStrategy}`,
    `estrategia_respuesta=${registryRule.answerStrategy}`,
    `evidencia_requerida=${registryRule.requiredEvidence.join(", ")}`,
    `escalar_si=${registryRule.escalationTrigger}`
  ].join(" | ");

  const stageOne = await runModelAnalysis({
    model: "gpt-4.1-mini",
    imageInputs,
    manualQuestion: manualQuestion.trim(),
    additionalContext: additionalContext.trim(),
    registryHint,
    escalationLevel: "standard"
  });

  if (!shouldEscalate(stageOne)) {
    return stageOne;
  }

  return runModelAnalysis({
    model: "gpt-4.1",
    imageInputs: [
      {
        type: "text",
        text:
          `Resultado preliminar a revisar críticamente: ` +
          JSON.stringify({
            respuesta: stageOne.respuesta,
            confianza: stageOne.confianza,
            tipo_de_pregunta: stageOne.tipo_de_pregunta,
            producto_confirmado: stageOne.target_product_search.producto_confirmado,
            no_puedo_responder: stageOne.no_puedo_responder,
            decision_supervisor: stageOne.decision_supervisor
          })
      },
      ...imageInputs
    ],
    manualQuestion: manualQuestion.trim(),
    additionalContext: additionalContext.trim(),
    registryHint,
    escalationLevel: "escalated"
  });
}
