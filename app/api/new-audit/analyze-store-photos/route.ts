import { NextResponse } from "next/server";
import { getMinimalWorkerBaseUrl } from "@/lib/pilot/minimal-worker-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const baseUrl = getMinimalWorkerBaseUrl() || "https://worker.germanospina.com";
    const endpoint = `${baseUrl}/new-audit/analyze-store-photos`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store"
    });
    const rawText = await response.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawText || "null");
    } catch {
      payload = rawText;
    }
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        endpoint: `${getMinimalWorkerBaseUrl() || "https://worker.germanospina.com"}/new-audit/analyze-store-photos`,
        body: null
      },
      { status: 500 }
    );
  }
}
