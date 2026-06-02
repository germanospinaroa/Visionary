import { NextResponse } from "next/server";
import { getMinimalWorkerBaseUrl } from "@/lib/pilot/minimal-worker-client";

export const runtime = "nodejs";

function normalizePayload(payload: Record<string, unknown> | null, baseUrl: string) {
  const screenshotPaths = Array.isArray(payload?.screenshots) ? (payload.screenshots as string[]) : [];
  const screenshotUrls = screenshotPaths.map(
    (screenshotPath) => `${baseUrl}/minimal-runs/artifact?path=${encodeURIComponent(screenshotPath)}`
  );
  return {
    ...payload,
    screenshotPaths,
    screenshotUrls,
    currentScreenshotUrl: screenshotUrls.at(-1) ?? null
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    stepperSessionId?: string;
  };

  const stepperSessionId = body.stepperSessionId?.trim() ?? "";
  if (!stepperSessionId) {
    return NextResponse.json({ error: "missing_stepper_session_id" }, { status: 400 });
  }

  const baseUrl = getMinimalWorkerBaseUrl() || "https://worker.germanospina.com";
  if (!baseUrl) {
    return NextResponse.json({ error: "minimal_worker_not_configured", endpoint: null, status: 503, body: null }, { status: 503 });
  }

  const endpoint = `${baseUrl}/minimal-runs/continue-next-question`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepperSessionId }),
      cache: "no-store"
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      return NextResponse.json(
        { error: (payload?.error as string | undefined) ?? "minimal_worker_request_failed", endpoint, status: response.status, body: payload },
        { status: response.status }
      );
    }

    return NextResponse.json({ mode: "real", payload: normalizePayload(payload, baseUrl) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error), endpoint, status: 500, body: null },
      { status: 500 }
    );
  }
}
