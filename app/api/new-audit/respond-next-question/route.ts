import { NextResponse } from "next/server";
import { getMinimalWorkerBaseUrl } from "@/lib/pilot/minimal-worker-client";
import type { ProjectQuestion } from "@/lib/new-audit-runtime";

export const runtime = "nodejs";

function normalizePayload(payload: Record<string, unknown> | null, baseUrl: string) {
  const screenshotPaths = Array.isArray(payload?.screenshots) ? (payload.screenshots as string[]) : [];
  const screenshotUrls = screenshotPaths.map(
    (screenshotPath) => `${baseUrl}/minimal-runs/artifact?path=${encodeURIComponent(screenshotPath)}`
  );
  const screenshotUrlByPath = new Map(screenshotPaths.map((path, index) => [path, screenshotUrls[index] ?? null]));
  const traceability = (payload?.traceability as Record<string, unknown> | undefined) ?? undefined;
  const withUrl = (path: unknown) => (typeof path === "string" && path ? (screenshotUrlByPath.get(path) ?? null) : null);

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
          : []
      }
    : undefined;

  return {
    ...payload,
    traceability: normalizedTraceability,
    screenshotPaths,
    screenshotUrls,
    currentScreenshotUrl: screenshotUrls.at(-1) ?? null
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    runId?: string;
    surveyUrl?: string;
    storeCode?: string;
    validatorCode?: string;
    questionResults?: Partial<ProjectQuestion>[];
    needsReviewBehavior?: "stop" | "select_no_puedo_responder";
    stepperSessionId?: string;
  };

  const runId = body.runId?.trim() ?? "";
  const surveyUrl = body.surveyUrl?.trim() ?? "";
  const storeCode = body.storeCode?.trim() ?? "";
  const validatorCode = body.validatorCode?.trim() ?? "";

  if (!runId && (!surveyUrl || !storeCode || !validatorCode || !Array.isArray(body.questionResults) || body.questionResults.length === 0)) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const baseUrl = getMinimalWorkerBaseUrl() || "https://worker.germanospina.com";
  if (!baseUrl) {
    return NextResponse.json({ error: "minimal_worker_not_configured", endpoint: null, status: 503, body: null }, { status: 503 });
  }

  const endpoint = `${baseUrl}/minimal-runs/answer-next-question`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        surveyUrl,
        storeCode,
        validatorCode,
        questionResults: body.questionResults,
        needsReviewBehavior: body.needsReviewBehavior ?? "stop",
        stepperSessionId: body.stepperSessionId?.trim() ?? ""
      }),
      cache: "no-store"
    });

    const rawText = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(rawText || "null") as Record<string, unknown> | null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      return NextResponse.json(
        {
          error: (payload?.error as string | undefined) ?? "minimal_worker_request_failed",
          endpoint,
          status: response.status,
          body: payload,
          rawText
        },
        { status: response.status }
      );
    }

    return NextResponse.json({ mode: "real", payload: normalizePayload(payload, baseUrl), rawText, endpoint, status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error), endpoint, status: 500, body: null },
      { status: 500 }
    );
  }
}
