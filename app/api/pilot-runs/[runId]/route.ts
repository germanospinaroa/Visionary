import { NextResponse } from "next/server";
import { getSurveyRunDetails } from "@/lib/pilot/db";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const result = await getSurveyRunDetails(runId);
  return NextResponse.json(result);
}
