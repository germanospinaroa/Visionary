import { NextResponse } from "next/server";
import { createBrowserEvent, updateSurveyRun } from "@/lib/pilot/db";
import { pauseRemotePilotRun } from "@/lib/pilot/worker-backend";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;

  try {
    await pauseRemotePilotRun(runId);

    await updateSurveyRun(runId, {
      status: "paused",
      current_step: "paused"
    });

    await createBrowserEvent({
      surveyRunId: runId,
      eventType: "pilot_paused",
      message: "Piloto pausado por operador.",
      details: {
        runId,
        step: "paused",
        timestamp: new Date().toISOString()
      }
    });

    return NextResponse.json({
      ok: true,
      message: "Piloto pausado."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "pause_failed",
        message: error instanceof Error ? error.message : "No se pudo pausar el piloto."
      },
      { status: 500 }
    );
  }
}
