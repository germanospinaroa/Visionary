import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mergePilotBrowserConfig } from "@/lib/pilot/config";
import { createBrowserEvent, getSurveyRunDetails, updateSurveyRun } from "@/lib/pilot/db";
import { diagnosePilotRunScreen } from "@/lib/pilot/worker";
import type { SurveySelectorConfig } from "@/lib/pilot/types";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const result = await getSurveyRunDetails(runId);
  return NextResponse.json(result);
}

export async function PATCH(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const body = (await request.json()) as {
    selectors?: Partial<SurveySelectorConfig>;
  };

  const supabase = createSupabaseAdminClient();
  const { data: run, error } = await supabase
    .from("survey_runs")
    .select("browser_config")
    .eq("id", runId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mergedConfig = mergePilotBrowserConfig({
    ...((run.browser_config as Record<string, unknown>) ?? {}),
    selectors: {
      ...((((run.browser_config as Record<string, unknown>)?.selectors as Record<string, unknown>) ?? {}) as Partial<SurveySelectorConfig>),
      ...(body.selectors ?? {})
    }
  });

  await updateSurveyRun(runId, {
    browser_config: mergedConfig
  });

  await createBrowserEvent({
    surveyRunId: runId,
    eventType: "selector_calibration_updated",
    message: "Selectores de calibración actualizados.",
    details: {
      runId,
      step: "selector_calibration",
      timestamp: new Date().toISOString()
    }
  });

  return NextResponse.json({
    ok: true,
    message: "Calibración guardada."
  });
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action !== "diagnose") {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }

  await diagnosePilotRunScreen(runId);

  await updateSurveyRun(runId, {
    current_step: "diagnostics"
  });

  await createBrowserEvent({
    surveyRunId: runId,
    eventType: "screen_diagnosis_requested",
    message: "Diagnóstico manual ejecutado sobre la pantalla actual.",
    details: {
      runId,
      step: "diagnostics",
      timestamp: new Date().toISOString()
    }
  });

  return NextResponse.json({
    ok: true,
    message: "Diagnóstico ejecutado. Revisa la línea de tiempo y la captura más reciente."
  });
}
