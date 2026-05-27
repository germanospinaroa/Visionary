import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { mergePilotBrowserConfig } from "@/lib/pilot/config";
import { createSignedStorageUrl } from "@/lib/pilot/storage";
import type { StartPilotRunInput } from "@/lib/pilot/types";

export async function createPilotSurveyRun(input: StartPilotRunInput) {
  const supabase = createSupabaseAdminClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .upsert(
      {
        store_code: input.storeCode.trim(),
        status: "pending"
      },
      {
        onConflict: "store_code"
      }
    )
    .select("id, store_code")
    .single();

  if (storeError) {
    throw storeError;
  }

  const { data: run, error: runError } = await supabase
    .from("survey_runs")
    .insert({
      store_id: store.id,
      survey_url: input.surveyUrl.trim(),
      validator_code: input.validatorCode.trim(),
      status: "pending",
      current_step: "created",
      browser_config: mergePilotBrowserConfig(input.browserConfig) as unknown as Json
    })
    .select("*")
    .single();

  if (runError) {
    throw runError;
  }

  await createBrowserEvent({
    surveyRunId: run.id,
    eventType: "run_created",
    message: "Run creado. Aún no hay worker conectado.",
    details: {
      runId: run.id,
      step: "created",
      timestamp: new Date().toISOString(),
      surveyUrl: input.surveyUrl.trim(),
      storeCode: input.storeCode.trim()
    }
  });

  return run;
}

export async function updateSurveyRun(runId: string, values: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("survey_runs")
    .update({
      ...values,
      last_heartbeat_at: new Date().toISOString()
    })
    .eq("id", runId);

  if (error) {
    throw error;
  }
}

export async function createBrowserEvent({
  surveyRunId,
  level = "info",
  eventType,
  message,
  details = {},
  screenshotBucket,
  screenshotPath
}: {
  surveyRunId: string;
  level?: "debug" | "info" | "warn" | "error";
  eventType: string;
  message: string;
  details?: Record<string, unknown>;
  screenshotBucket?: string;
  screenshotPath?: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("browser_events").insert({
    survey_run_id: surveyRunId,
    level,
    event_type: eventType,
    message,
    details: (details ?? {}) as unknown as Json,
    screenshot_bucket: screenshotBucket,
    screenshot_path: screenshotPath
  });

  if (error) {
    throw error;
  }
}

export async function createImageRecord(values: TablesInsert<"images">) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("images").insert(values).select("id").single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

export async function createQuestionRecord(values: TablesInsert<"questions">) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("questions").insert(values).select("id").single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

export async function upsertAnswerRecord(
  questionId: string,
  values: Omit<TablesInsert<"answers">, "question_id">
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("answers")
    .upsert(
      {
        question_id: questionId,
        ...values
      },
      {
        onConflict: "question_id"
      }
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

export async function getSurveyRunDetails(runId: string) {
  const supabase = createSupabaseAdminClient();

  const [{ data: run, error: runError }, { data: questions, error: questionsError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase
        .from("survey_runs")
        .select("*, stores(store_code)")
        .eq("id", runId)
        .single(),
      supabase
        .from("questions")
        .select("*, answers(*)")
        .eq("survey_run_id", runId)
        .order("question_index", { ascending: true }),
      supabase
        .from("browser_events")
        .select("*")
        .eq("survey_run_id", runId)
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

  if (runError) {
    throw runError;
  }

  if (questionsError) {
    throw questionsError;
  }

  if (eventsError) {
    throw eventsError;
  }

  const currentScreenshotUrl =
    run.current_screenshot_bucket && run.current_screenshot_path
      ? await createSignedStorageUrl(run.current_screenshot_bucket, run.current_screenshot_path, 600).catch(
          () => null
        )
      : null;

  const errorScreenshotUrl =
    run.error_screenshot_bucket && run.error_screenshot_path
      ? await createSignedStorageUrl(run.error_screenshot_bucket, run.error_screenshot_path, 600).catch(
          () => null
        )
      : null;

  return {
    run,
    questions,
    events,
    currentScreenshotUrl,
    errorScreenshotUrl
  };
}

export async function listRecentPilotRuns() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("survey_runs")
    .select(
      "id, status, survey_url, current_step, current_question_index, final_code, created_at, completed_at, last_heartbeat_at, last_error, current_screenshot_updated_at, stores(store_code)"
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return data;
}
