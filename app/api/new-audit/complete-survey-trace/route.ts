import { NextResponse } from "next/server";
import { getMinimalWorkerBaseUrl } from "@/lib/pilot/minimal-worker-client";
import type { ProjectQuestion } from "@/lib/new-audit-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    surveyUrl?: string;
    storeCode?: string;
    validatorCode?: string;
    questionResults?: Partial<ProjectQuestion>[];
    needsReviewBehavior?: "stop" | "select_no_puedo_responder";
  };

  const surveyUrl = body.surveyUrl?.trim() ?? "";
  const storeCode = body.storeCode?.trim() ?? "";
  const validatorCode = body.validatorCode?.trim() ?? "";

  if (!surveyUrl || !storeCode || !validatorCode || !Array.isArray(body.questionResults) || body.questionResults.length === 0) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const baseUrl = getMinimalWorkerBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      {
        error: "minimal_worker_not_configured",
        endpoint: null,
        status: 503,
        body: null
      },
      { status: 503 }
    );
  }

  const endpoint = `${baseUrl}/minimal-runs/complete-survey-trace`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        surveyUrl,
        storeCode,
        validatorCode,
        questionResults: body.questionResults,
        needsReviewBehavior: body.needsReviewBehavior ?? "stop"
      }),
      cache: "no-store"
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: (payload?.error as string | undefined) ?? "minimal_worker_request_failed",
          endpoint,
          status: response.status,
          body: payload
        },
        { status: response.status }
      );
    }

    const screenshotPaths = Array.isArray(payload?.screenshots) ? (payload.screenshots as string[]) : [];
    const screenshotUrls = screenshotPaths.map(
      (screenshotPath) => `${baseUrl}/minimal-runs/artifact?path=${encodeURIComponent(screenshotPath)}`
    );
    const screenshotUrlByPath = new Map(screenshotPaths.map((path, index) => [path, screenshotUrls[index] ?? null]));
    const traceability = (payload?.traceability as Record<string, unknown> | undefined) ?? undefined;

    const withUrl = (path: unknown) =>
      typeof path === "string" && path ? (screenshotUrlByPath.get(path) ?? null) : null;

    const normalizedTraceability = traceability
      ? {
          ...traceability,
          questionTraces: Array.isArray(traceability.questionTraces)
            ? traceability.questionTraces.map((entry) => {
                const item = entry as Record<string, unknown>;
                return {
                  ...item,
                  beforeScreenshotUrl: withUrl(item.beforeScreenshotPath),
                  selectedScreenshotUrl: withUrl(item.selectedScreenshotPath),
                  afterScreenshotUrl: withUrl(item.afterScreenshotPath)
                };
              })
            : [],
          photoUploadScreen: traceability.photoUploadScreen
            ? {
                ...(traceability.photoUploadScreen as Record<string, unknown>),
                url: withUrl((traceability.photoUploadScreen as Record<string, unknown>).path)
              }
            : null,
          photoSelected: traceability.photoSelected
            ? {
                ...(traceability.photoSelected as Record<string, unknown>),
                url: withUrl((traceability.photoSelected as Record<string, unknown>).path)
              }
            : null,
          photoConfirmationScreen: traceability.photoConfirmationScreen
            ? {
                ...(traceability.photoConfirmationScreen as Record<string, unknown>),
                url: withUrl((traceability.photoConfirmationScreen as Record<string, unknown>).path)
              }
            : null,
          surveyFinalReview: traceability.surveyFinalReview
            ? {
                ...(traceability.surveyFinalReview as Record<string, unknown>),
                url: withUrl((traceability.surveyFinalReview as Record<string, unknown>).path)
              }
            : null,
          surveySubmitted: traceability.surveySubmitted
            ? {
                ...(traceability.surveySubmitted as Record<string, unknown>),
                url: withUrl((traceability.surveySubmitted as Record<string, unknown>).path)
              }
            : null,
          surveyCompletionNumber: traceability.surveyCompletionNumber
            ? {
                ...(traceability.surveyCompletionNumber as Record<string, unknown>),
                url: withUrl((traceability.surveyCompletionNumber as Record<string, unknown>).screenshot)
              }
            : null,
          surveyFinished: traceability.surveyFinished
            ? {
                ...(traceability.surveyFinished as Record<string, unknown>),
                url: withUrl((traceability.surveyFinished as Record<string, unknown>).path)
              }
            : null
        }
      : undefined;

    return NextResponse.json({
      mode: "real",
      payload: {
        ...payload,
        traceability: normalizedTraceability,
        screenshotPaths,
        screenshotUrls,
        currentScreenshotUrl: screenshotUrls.at(-1) ?? null
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        endpoint,
        status: 500,
        body: null
      },
      { status: 500 }
    );
  }
}
