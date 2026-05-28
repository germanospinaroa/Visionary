import { NextResponse } from "next/server";
import { createBrowserEvent, createPilotSurveyRun, listRecentPilotRuns, updateSurveyRun } from "@/lib/pilot/db";
import { mergePilotBrowserConfig } from "@/lib/pilot/config";
import { startRemotePilotRun } from "@/lib/pilot/worker-backend";
import type { SurveySelectorConfig } from "@/lib/pilot/types";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRecentPilotRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    storeCode?: string;
    surveyUrl?: string;
    validatorCode?: string;
    headless?: boolean;
    selectors?: Partial<SurveySelectorConfig>;
  };

  if (!body.storeCode?.trim()) {
    return NextResponse.json({ error: "store_code_required" }, { status: 400 });
  }

  if (!body.surveyUrl?.trim()) {
    return NextResponse.json({ error: "survey_url_required" }, { status: 400 });
  }

  if (!body.validatorCode?.trim()) {
    return NextResponse.json({ error: "validator_code_required" }, { status: 400 });
  }

  const run = await createPilotSurveyRun({
    storeCode: body.storeCode,
    surveyUrl: body.surveyUrl,
    validatorCode: body.validatorCode,
    browserConfig: mergePilotBrowserConfig({
      headless: body.headless ?? true,
      selectors: body.selectors
    })
  });

  let launchAccepted = true;
  let message = "Piloto enviado. El agente está iniciando la navegación.";
  let detail: string | null = null;

  try {
    await startRemotePilotRun(run.id);
    await createBrowserEvent({
      surveyRunId: run.id,
      eventType: "pilot_dispatched",
      message: "Ejecución enviada al agente operativo.",
      details: {
        runId: run.id,
        step: "dispatch",
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    launchAccepted = false;
    message = "No se pudo iniciar la automatización del piloto.";
    detail = error instanceof Error ? error.message : "No se pudo iniciar la automatización del piloto.";

    await updateSurveyRun(run.id, {
      status: "failed",
      current_step: "dispatch_failed",
      last_error: detail
    });

    await createBrowserEvent({
      surveyRunId: run.id,
      level: "error",
      eventType: "pilot_dispatch_failed",
      message,
      details: {
        runId: run.id,
        step: "dispatch_failed",
        timestamp: new Date().toISOString(),
        detail
      }
    });
  }

  return NextResponse.json({
    runId: run.id,
    launchAccepted,
    message,
    detail
  });
}
