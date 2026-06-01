import { NextResponse } from "next/server";
import {
  runNewAuditVisualAnalysis,
  validateVisualAnalysisInput,
  type VisualQuestionInput,
  type VisualStorePhotoInput
} from "@/lib/new-audit-visual-analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let diagnostics = {
    endpoint: "/api/new-audit/analyze-visual",
    openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    storePhotosReceived: 0,
    projectQuestionsReceived: 0,
    referenceImagesReceived: 0
  };

  try {
    console.log("ANALYZE_VISUAL_REQUEST_RECEIVED");

    const body = (await request.json()) as {
      storePhotos?: VisualStorePhotoInput[];
      projectQuestions?: VisualQuestionInput[];
      generalInstructions?: string;
    };

    const storePhotos = Array.isArray(body.storePhotos) ? body.storePhotos : [];
    const projectQuestions = Array.isArray(body.projectQuestions) ? body.projectQuestions : [];
    const generalInstructions = body.generalInstructions?.trim() ?? "";
    const referenceImagesReceived = projectQuestions.filter(
      (question) =>
        Boolean(question.referenceImageDataUrl?.trim()) ||
        Boolean(question.referenceImage?.trim()) ||
        Boolean(question.referenceImageUrl?.trim())
    ).length;

    diagnostics = {
      ...diagnostics,
      storePhotosReceived: storePhotos.length,
      projectQuestionsReceived: projectQuestions.length,
      referenceImagesReceived
    };

    console.log("QUESTION_COUNT", projectQuestions.length);
    console.log("PHOTO_COUNT", storePhotos.length);
    console.log("REFERENCE_COUNT", referenceImagesReceived);

    validateVisualAnalysisInput({
      storePhotos,
      projectQuestions,
      generalInstructions
    });

    console.log("OPENAI_REQUEST_START");
    const result = await runNewAuditVisualAnalysis({
      storePhotos,
      projectQuestions,
      generalInstructions
    });
    console.log("OPENAI_RESPONSE_RECEIVED");
    console.log("QUESTION_RESULTS_COUNT", result.questionResults.length);
    console.log(
      "QUESTION_IDS_RETURNED",
      result.questionResults.map((question) => question.questionId)
    );
    console.log("MAPPING_START");
    console.log(
      "MAPPING_COMPLETE",
      projectQuestions
        .map((question) => question.id)
        .filter((questionId) => result.questionResults.some((resultItem) => resultItem.questionId === questionId))
    );
    console.log("RESPONSE_SENT");

    return NextResponse.json({
      ...result,
      diagnostics
    });
  } catch (error) {
    const errorObject = error instanceof Error ? error : new Error(String(error));
    console.error("ANALYZE_VISUAL_ERROR", {
      name: errorObject.name,
      message: errorObject.message,
      stack: errorObject.stack ?? null,
      diagnostics
    });

    const message = errorObject.message;
    const name = errorObject.name;
    const stack = errorObject.stack ?? null;
    const status =
      message === "MISSING_STORE_PHOTOS" ||
      message === "STORE_PHOTOS_WITHOUT_USABLE_URL" ||
      message === "MISSING_PROJECT_QUESTIONS" ||
      message === "NO_ACTIVE_VISUAL_QUESTIONS" ||
      message.startsWith("MISSING_REFERENCE_IMAGE_FOR_QUESTION_IDS:") ||
      message === "MISSING_GENERAL_INSTRUCTIONS"
        ? 400
        : message === "OPENAI_API_KEY_NOT_CONFIGURED"
          ? 500
          : message.includes("INVALID_VISUAL_ANALYSIS_RESPONSE")
            ? 502
            : 500;

    return NextResponse.json(
      {
        error: {
          message: message || "INTERNAL_ERROR",
          stack,
          name
        },
        diagnostics
      },
      { status }
    );
  }
}
