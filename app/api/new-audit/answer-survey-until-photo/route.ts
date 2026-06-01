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

  const endpoint = `${baseUrl}/minimal-runs/answer-until-photo`;

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

    return NextResponse.json({
      mode: "real",
      payload: {
        ...payload,
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
