import { NextResponse } from "next/server";
import { createBrowserEvent, updateSurveyRun } from "@/lib/pilot/db";
import { stopRemotePilotRun } from "@/lib/pilot/worker-backend";

export const runtime = "nodejs";

export async function POST(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;

  try {
    await stopRemotePilotRun(runId);

    await updateSurveyRun(runId, {
      status: "failed",
      current_step: "stopped",
      last_error: "Piloto detenido por operador."
    });

    await createBrowserEvent({
      surveyRunId: runId,
      level: "warn",
      eventType: "pilot_stopped",
      message: "Piloto detenido por operador.",
      details: {
        runId,
        step: "stopped",
        timestamp: new Date().toISOString()
      }
    });

    return NextResponse.json({
      ok: true,
      message: "Piloto detenido."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "stop_failed",
        message: error instanceof Error ? error.message : "No se pudo detener el piloto."
      },
      { status: 500 }
    );
  }
}
