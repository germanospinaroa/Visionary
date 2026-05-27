import { NextResponse } from "next/server";
import { type AnalyzeError } from "@/lib/schema";
import {
  assertValidHttpUrl,
  isSupportedImageType
} from "@/lib/image";
import { runVisualAnalysis } from "@/lib/analysis/run-visual-analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(status: number, error: string, detail: string) {
  return NextResponse.json<AnalyzeError>({ error, detail }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const mainImageUrlInput = formData.get("mainImageUrl");
    const questionnaireImage = formData.get("questionnaireImage");
    const manualQuestion = formData.get("manualQuestion");
    const additionalContext = formData.get("additionalContext");

    if (typeof mainImageUrlInput !== "string" || !mainImageUrlInput.trim()) {
      return errorResponse(400, "invalid_url", "Debes proporcionar la URL de la imagen principal.");
    }

    const mainImageUrl = assertValidHttpUrl(mainImageUrlInput.trim());

    if (!(questionnaireImage instanceof File)) {
      return errorResponse(400, "missing_file", "Debes subir una imagen del cuestionario.");
    }

    if (!questionnaireImage.type || !isSupportedImageType(questionnaireImage.type)) {
      return errorResponse(
        400,
        "unsupported_file",
        "El archivo del cuestionario debe ser una imagen JPG, PNG, WEBP o GIF."
      );
    }

    const result = await runVisualAnalysis({
      mainImageUrl,
      questionnaireImage: Buffer.from(await questionnaireImage.arrayBuffer()),
      questionnaireImageMimeType: questionnaireImage.type,
      questionnaireFilename: questionnaireImage.name,
      manualQuestion: typeof manualQuestion === "string" ? manualQuestion.trim() : "",
      additionalContext: typeof additionalContext === "string" ? additionalContext.trim() : ""
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";

    if (message.includes("URL de la imagen principal")) {
      return errorResponse(400, "invalid_url", message);
    }

    if (
      message.includes("no devolvió una imagen") ||
      message.includes("no se encontró una imagen pública descargable")
    ) {
      return errorResponse(422, "not_an_image", message);
    }

    if (
      message.includes("No se pudo descargar la imagen principal") ||
      message.includes("timed out") ||
      message.includes("fetch failed")
    ) {
      return errorResponse(422, "image_fetch_failed", message);
    }

    if (
      message.includes("respuesta del modelo") ||
      message.includes("no es un objeto JSON") ||
      message.includes("campo")
    ) {
      return errorResponse(502, "invalid_model_response", message);
    }

    if (message.includes("OPENAI_API_KEY")) {
      return errorResponse(500, "missing_api_key", message);
    }

    return errorResponse(500, "internal_error", message);
  }
}
