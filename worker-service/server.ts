import fs from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOpenAIClient } from "@/lib/openai";
import { createBrowserEvent, getSurveyRunDetails, updateSurveyRun } from "@/lib/pilot/db";
import {
  runMinimalSurveyFlow,
  runSurveyAnsweringUntilPhotoSelection,
  runSurveyCompletionWithTraceability,
  submitPreparedSurveyConfirmation
} from "@/lib/pilot/minimal-worker";
import { diagnosePilotRunScreen, runPilotSurvey } from "@/lib/pilot/worker";

const port = Number(process.env.PILOT_WORKER_API_PORT ?? process.env.PORT ?? 4001);
const maxConcurrentRuns = Number(process.env.PILOT_MAX_CONCURRENT_RUNS ?? 2);
const runTimeoutMs = Number(process.env.PILOT_RUN_TIMEOUT_MS ?? 15 * 60 * 1000);
const shutdownGraceMs = Number(process.env.PILOT_SHUTDOWN_GRACE_MS ?? 10_000);
const requiredEnvNames = [
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];

type ActiveRun = {
  startedAt: number;
  promise: Promise<void>;
};

const activeRuns = new Map<string, ActiveRun>();
const allowedOrigin = "https://visual-validator-mvp.vercel.app";

type MinimalQuestionResultPayload = {
  id?: number;
  questionId?: number;
  physicalNumber?: string;
  text?: string;
  referenceImageUrl?: string;
  expectedOptions?: string[];
  status?: "pending" | "analyzing" | "answered" | "needs_review";
  suggestedAnswer?: string;
  storePhotosUsed?: number[];
};

type MinimalRunRequestBody = {
  surveyUrl?: string;
  storeCode?: string;
  validatorCode?: string;
  runId?: string;
  questionResults?: MinimalQuestionResultPayload[];
  needsReviewBehavior?: "stop" | "select_no_puedo_responder";
  preparedSessionId?: string;
  stepperSessionId?: string;
};

type WorkerActionLog = {
  timestamp: string;
  event: string;
  detail?: unknown;
};

function log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
  const payload = {
    level,
    scope: "pilot-worker-service",
    timestamp: new Date().toISOString(),
    message,
    ...(extra ?? {})
  };

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

function setCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  const allowOrigin = origin === allowedOrigin ? origin : allowedOrigin;
  response.setHeader("access-control-allow-origin", allowOrigin);
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, authorization");
  response.setHeader("access-control-max-age", "86400");
  response.setHeader("vary", "Origin");
}

function assertRequiredEnv() {
  const missing = requiredEnvNames.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function now() {
  return new Date().toISOString();
}

function buildActionLog(event: string, detail?: unknown): WorkerActionLog {
  return {
    timestamp: now(),
    event,
    detail
  };
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAllowedArtifactPath(targetPath: string) {
  const normalized = path.resolve(targetPath);
  const allowedRoot = path.resolve(process.cwd(), "output", "playwright", "minimal-runs");
  return normalized.startsWith(allowedRoot);
}

function getArtifactContentType(targetPath: string) {
  const lower = targetPath.toLowerCase();

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".json")) {
    return "application/json";
  }

  return "text/plain; charset=utf-8";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function validateSupabaseConnection() {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("survey_runs").select("id", { count: "exact", head: true }).limit(1);

  if (error) {
    throw error;
  }

  return true;
}

async function validateOpenAIConnection() {
  const client = getOpenAIClient();
  await client.models.list();
  return true;
}

async function getDependencyHealth() {
  const checks = await Promise.allSettled([
    withTimeout(validateSupabaseConnection(), 5_000, "Supabase healthcheck"),
    withTimeout(validateOpenAIConnection(), 8_000, "OpenAI healthcheck")
  ]);

  return {
    supabase: checks[0].status === "fulfilled" ? "ok" : checks[0].reason instanceof Error ? checks[0].reason.message : "error",
    openai: checks[1].status === "fulfilled" ? "ok" : checks[1].reason instanceof Error ? checks[1].reason.message : "error"
  };
}

async function markControlEvent(runId: string, eventType: string, message: string, nextStatus: string, step: string) {
  await updateSurveyRun(runId, {
    status: nextStatus,
    current_step: step,
    last_error: nextStatus === "failed" ? message : null
  });

  await createBrowserEvent({
    surveyRunId: runId,
    level: nextStatus === "failed" ? "warn" : "info",
    eventType,
    message,
    details: {
      runId,
      step,
      timestamp: new Date().toISOString()
    }
  });
}

async function executeRunWithRecovery(runId: string) {
  try {
    await withTimeout(runPilotSurvey(runId), runTimeoutMs, `Pilot run ${runId}`);
    log("info", "Pilot run completed.", { runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fallo del servicio operativo.";

    log("error", "Pilot run failed.", {
      runId,
      error: message
    });

    await updateSurveyRun(runId, {
      status: "failed",
      current_step: "worker_service_failed",
      last_error: message
    }).catch(() => null);

    await createBrowserEvent({
      surveyRunId: runId,
      level: "error",
      eventType: "worker_service_failed",
      message,
      details: {
        runId,
        step: "worker_service",
        timestamp: new Date().toISOString()
      }
    }).catch(() => null);
  } finally {
    activeRuns.delete(runId);
  }
}

async function handleStartRun(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody(request);
  const runId = typeof body.runId === "string" ? body.runId : "";

  log("info", "Start run payload received.", {
    path: "/runs/start",
    origin: request.headers.origin ?? null,
    body
  });

  if (!runId) {
    writeJson(response, 400, {
      message: "runId es obligatorio."
    });
    return;
  }

  if (activeRuns.has(runId)) {
    writeJson(response, 409, {
      message: "El piloto ya está en ejecución."
    });
    return;
  }

  if (activeRuns.size >= maxConcurrentRuns) {
    writeJson(response, 429, {
      message: "El servicio alcanzó el máximo de ejecuciones concurrentes."
    });
    return;
  }

  await withTimeout(validateSupabaseConnection(), 5_000, "Supabase validation before run");
  await withTimeout(validateOpenAIConnection(), 8_000, "OpenAI validation before run");

  const execution = executeRunWithRecovery(runId);

  activeRuns.set(runId, {
    startedAt: Date.now(),
    promise: execution
  });

  log("info", "Pilot run accepted.", {
    runId,
    activeRuns: activeRuns.size
  });

  const payload = {
    ok: true,
    runId,
    message: "Piloto aceptado por el servicio operativo."
  };
  writeJson(response, 202, payload);
  log("info", "Request completed.", {
    method: "POST",
    path: "/runs/start",
    origin: request.headers.origin ?? null,
    status: 202,
    body: payload
  });
}

async function handlePauseRun(runId: string, response: ServerResponse) {
  await markControlEvent(runId, "pause_requested", "Pausa solicitada por operador.", "paused", "pause_requested");
  log("warn", "Pause requested.", { runId });
  const payload = {
    ok: true,
    runId,
    message: "Pausa solicitada."
  };
  writeJson(response, 200, payload);
  log("info", "Request completed.", {
    method: "POST",
    path: `/runs/${runId}/pause`,
    status: 200,
    body: payload
  });
}

async function handleStopRun(runId: string, response: ServerResponse) {
  await markControlEvent(runId, "stop_requested", "Detención solicitada por operador.", "failed", "stop_requested");
  log("warn", "Stop requested.", { runId });
  const payload = {
    ok: true,
    runId,
    message: "Detención solicitada."
  };
  writeJson(response, 200, payload);
  log("info", "Request completed.", {
    method: "POST",
    path: `/runs/${runId}/stop`,
    status: 200,
    body: payload
  });
}

async function handleStatusRun(runId: string, response: ServerResponse) {
  const details = await getSurveyRunDetails(runId);
  const active = activeRuns.get(runId);

  const payload = {
    ok: true,
    runId,
    status: details.run.status,
    currentStep: details.run.current_step,
    currentQuestion: details.run.current_question_text,
    latestEvent: details.events[0] ?? null,
    currentScreenshotUrl: details.currentScreenshotUrl,
    active: Boolean(active),
    startedAt: active ? new Date(active.startedAt).toISOString() : null
  };
  writeJson(response, 200, payload);
  log("info", "Request completed.", {
    method: "GET",
    path: `/runs/${runId}/status`,
    status: 200,
    body: payload
  });
}

async function handleDiagnoseRun(runId: string, response: ServerResponse) {
  const diagnostic = await withTimeout(diagnosePilotRunScreen(runId), 30_000, `Pilot diagnose ${runId}`);

  log("info", "Pilot screen diagnosed.", { runId });

  const payload = {
    runId,
    diagnostic
  };
  writeJson(response, 200, {
    ok: diagnostic && typeof diagnostic === "object" && "ok" in diagnostic ? Boolean(diagnostic.ok) : true,
    ...payload
  });
  log("info", "Request completed.", {
    method: "POST",
    path: `/runs/${runId}/diagnose`,
    status: 200,
    body: {
      ok: diagnostic && typeof diagnostic === "object" && "ok" in diagnostic ? Boolean(diagnostic.ok) : true,
      ...payload
    }
  });
}

async function handleMinimalRunStart(request: IncomingMessage, response: ServerResponse) {
  const body = (await readJsonBody(request)) as MinimalRunRequestBody;
  const surveyUrl = typeof body.surveyUrl === "string" ? body.surveyUrl.trim() : "";
  const storeCode = typeof body.storeCode === "string" ? body.storeCode.trim() : "";
  const validatorCode = typeof body.validatorCode === "string" ? body.validatorCode.trim() : "";

  log("info", "Minimal run payload received.", {
    path: "/minimal-runs/start",
    origin: request.headers.origin ?? null,
    body: {
      surveyUrl,
      storeCode,
      validatorCode
    }
  });

  if (!surveyUrl || !storeCode || !validatorCode) {
    const payload = {
      ok: false,
      error: "missing_required_fields"
    };
    writeJson(response, 400, payload);
    log("warn", "Request completed.", {
      method: "POST",
      path: "/minimal-runs/start",
      status: 400,
      body: payload
    });
    return;
  }

  const result = await runMinimalSurveyFlow({
    surveyUrl,
    storeCode,
    validatorCode
  });

  writeJson(response, result.ok ? 200 : 500, result);
  log("info", "Request completed.", {
    method: "POST",
    path: "/minimal-runs/start",
    status: result.ok ? 200 : 500,
    body: {
      ok: result.ok,
      currentStep: result.currentStep,
      finalUrl: result.finalUrl,
      detectedFirstQuestion: result.detectedFirstQuestion,
      radioCount: result.radioCount,
      finalBodyTextLength: result.finalBodyTextLength
    }
  });
}

function normalizeQuestionResults(questionResults: MinimalQuestionResultPayload[] = []) {
  return questionResults.map((question, index) => ({
    id:
      typeof question.id === "number"
        ? question.id
        : typeof question.questionId === "number"
          ? question.questionId
          : index + 1,
    physicalNumber: question.physicalNumber?.trim() ?? "",
    text: question.text?.trim() ?? "",
    referenceImageUrl: question.referenceImageUrl?.trim() ?? "",
    expectedOptions: question.expectedOptions ?? ["SI", "NO", "No puedo responder"],
    status: question.status ?? "pending",
    suggestedAnswer: question.suggestedAnswer?.trim() ?? "No puedo responder",
    storePhotosUsed: Array.isArray(question.storePhotosUsed) ? question.storePhotosUsed : []
  }));
}

async function handleNewAuditStepperAction(
  request: IncomingMessage,
  response: ServerResponse,
  action: "respond-next-question" | "continue-next-question"
) {
  try {
    const body = (await readJsonBody(request)) as MinimalRunRequestBody;
    const actionLogs: WorkerActionLog[] = [];

    if (action === "continue-next-question") {
      const stepperSessionId = body.stepperSessionId?.trim() ?? "";
      if (!stepperSessionId) {
        writeJson(response, 400, { ok: false, error: "missing_stepper_session_id" });
        return;
      }

      writeJson(response, 501, {
        ok: false,
        error: "STEPPER_CONTINUE_NOT_IMPLEMENTED",
        detail: "La ruta existe, pero la continuacion del stepper no esta conectada en este worker."
      });
      return;
    }

    const runId = body.runId?.trim() ?? "";
    actionLogs.push(buildActionLog("RESPOND_NEXT_QUESTION_RUN_ID", {
      runId: runId || null
    }));

    if (runId) {
      const validUuid = isValidUuid(runId);
      actionLogs.push(buildActionLog("RUN_ID_IS_VALID_UUID", {
        runId,
        valid: validUuid
      }));

      if (!validUuid) {
        writeJson(response, 400, {
          ok: false,
          error: "INVALID_RUN_ID",
          message: "runId debe ser un UUID valido",
          actionLogs
        });
        return;
      }

      const run = await getSurveyRunDetails(runId).catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "PGRST116"
        ) {
          return null;
        }
        throw error;
      });
      actionLogs.push(buildActionLog("STEPPER_SESSION_LOOKUP_RESULT", {
        runId,
        found: Boolean(run)
      }));
      if (!run) {
        writeJson(response, 404, {
          ok: false,
          error: "RUN_SESSION_NOT_FOUND",
          actionLogs
        });
        return;
      }
    }

    const surveyUrl = body.surveyUrl?.trim() ?? "";
    const storeCode = body.storeCode?.trim() ?? "";
    const validatorCode = body.validatorCode?.trim() ?? "";
    const questionResults = Array.isArray(body.questionResults) ? body.questionResults : [];

    if (!runId && (!surveyUrl || !storeCode || !validatorCode || questionResults.length === 0)) {
      writeJson(response, 400, { ok: false, error: "missing_required_fields" });
      return;
    }

    writeJson(response, 501, {
      ok: false,
      error: "STEPPER_NOT_IMPLEMENTED",
      detail: "La ruta existe, pero la ejecucion del stepper no esta conectada en este worker.",
      actionLogs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del stepper.";
    const stack = error instanceof Error ? error.stack ?? null : null;
    const cause =
      error instanceof Error && "cause" in error
        ? (() => {
            const errorCause = (error as Error & { cause?: unknown }).cause;
            if (errorCause instanceof Error) {
              return {
                message: errorCause.message,
                stack: errorCause.stack ?? null
              };
            }
            return errorCause ?? null;
          })()
        : null;
    const rawError =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null
          }
        : (() => {
            try {
              return JSON.parse(JSON.stringify(error));
            } catch {
              return String(error);
            }
          })();

    log("error", "New audit stepper action failed.", {
      action,
      message,
      stack,
      cause,
      rawError
    });

    writeJson(response, 500, {
      ok: false,
      error: "worker_service_error",
      message,
      stack,
      cause,
      rawError
    });
  }
}

async function handleMinimalSurveyAction(
  request: IncomingMessage,
  response: ServerResponse,
  action: "answer-until-photo" | "complete-survey-trace" | "submit-confirmed-survey"
) {
  const body = (await readJsonBody(request)) as MinimalRunRequestBody;

  if (action === "submit-confirmed-survey") {
    const preparedSessionId = body.preparedSessionId?.trim() ?? "";

    log("info", "Minimal submit confirmation payload received.", {
      path: "/minimal-runs/submit-confirmed-survey",
      origin: request.headers.origin ?? null,
      preparedSessionId
    });

    if (!preparedSessionId) {
      const payload = {
        ok: false,
        error: "missing_prepared_session_id",
        detail: "preparedSessionId es obligatorio."
      };
      writeJson(response, 400, payload);
      log("warn", "Request completed.", {
        method: "POST",
        path: "/minimal-runs/submit-confirmed-survey",
        status: 400,
        body: payload
      });
      return;
    }

    const result = await submitPreparedSurveyConfirmation(preparedSessionId);
    writeJson(response, result.ok ? 200 : 500, result);
    log(result.ok ? "info" : "warn", "Request completed.", {
      method: "POST",
      path: "/minimal-runs/submit-confirmed-survey",
      status: result.ok ? 200 : 500,
      body: {
        ok: result.ok,
        finalState: result.finalState,
        surveyCompletionNumber: result.surveyCompletionNumber ?? null,
        preparedSessionId: result.preparedSessionId ?? null
      }
    });
    return;
  }

  const surveyUrl = body.surveyUrl?.trim() ?? "";
  const storeCode = body.storeCode?.trim() ?? "";
  const validatorCode = body.validatorCode?.trim() ?? "";

  log("info", "Minimal survey action payload received.", {
    path: action === "complete-survey-trace" ? "/minimal-runs/complete-survey-trace" : "/minimal-runs/answer-until-photo",
    origin: request.headers.origin ?? null,
    body: {
      surveyUrl,
      storeCode,
      validatorCode,
      questionResultsCount: body.questionResults?.length ?? 0,
      needsReviewBehavior: body.needsReviewBehavior ?? "stop"
    }
  });

  if (!surveyUrl || !storeCode || !validatorCode) {
    const payload = {
      ok: false,
      error: "missing_required_fields",
      detail: "surveyUrl, storeCode y validatorCode son obligatorios."
    };
    writeJson(response, 400, payload);
    log("warn", "Request completed.", {
      method: "POST",
      path: action === "complete-survey-trace" ? "/minimal-runs/complete-survey-trace" : "/minimal-runs/answer-until-photo",
      status: 400,
      body: payload
    });
    return;
  }

  const params = {
    surveyUrl,
    storeCode,
    validatorCode,
    questionResults: normalizeQuestionResults(body.questionResults),
    needsReviewBehavior: body.needsReviewBehavior ?? "stop"
  };

  const result =
    action === "complete-survey-trace"
      ? await runSurveyCompletionWithTraceability(params)
      : await runSurveyAnsweringUntilPhotoSelection(params);

  writeJson(response, 200, result);
  log(result.ok ? "info" : "warn", "Request completed.", {
    method: "POST",
    path: action === "complete-survey-trace" ? "/minimal-runs/complete-survey-trace" : "/minimal-runs/answer-until-photo",
    status: 200,
    body: {
      ok: result.ok,
      finalState: result.finalState,
      currentStep: result.currentStep,
      screenshots: result.screenshots.length,
      preparedSessionId: result.preparedSessionId ?? null
    }
  });
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
  const origin = request.headers.origin ?? null;

  setCorsHeaders(request, response);

  log("info", "Incoming request.", {
    method,
    path: url.pathname,
    origin
  });

  try {
    if (method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      log("info", "Preflight request handled.", {
        method,
        path: url.pathname,
        origin,
        status: 204
      });
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      const dependencies = await getDependencyHealth();
      const ok = dependencies.supabase === "ok" && dependencies.openai === "ok";

      const status = ok ? 200 : 503;
      const payload = {
        ok,
        activeRuns: activeRuns.size,
        maxConcurrentRuns,
        dependencies
      };
      writeJson(response, status, payload);
      log("info", "Request completed.", {
        method,
        path: url.pathname,
        origin,
        status,
        body: payload
      });
      return;
    }

    if (method === "GET" && url.pathname === "/minimal-runs/artifact") {
      const filePath = url.searchParams.get("path")?.trim() ?? "";

      if (!filePath || !isAllowedArtifactPath(filePath) || !fs.existsSync(filePath)) {
        const payload = {
          ok: false,
          error: "artifact_not_found"
        };
        writeJson(response, 404, payload);
        log("warn", "Request completed.", {
          method,
          path: url.pathname,
          origin,
          status: 404,
          body: payload
        });
        return;
      }

      response.statusCode = 200;
      response.setHeader("content-type", getArtifactContentType(filePath));
      response.end(fs.readFileSync(filePath));
      log("info", "Request completed.", {
        method,
        path: url.pathname,
        origin,
        status: 200,
        body: {
          ok: true,
          filePath
        }
      });
      return;
    }

    if (method === "POST" && url.pathname === "/runs/start") {
      await handleStartRun(request, response);
      return;
    }

    if (method === "POST" && url.pathname === "/minimal-runs/start") {
      await handleMinimalRunStart(request, response);
      return;
    }

    if (method === "POST" && url.pathname === "/minimal-runs/answer-until-photo") {
      await handleMinimalSurveyAction(request, response, "answer-until-photo");
      return;
    }

    if (method === "POST" && url.pathname === "/minimal-runs/complete-survey-trace") {
      await handleMinimalSurveyAction(request, response, "complete-survey-trace");
      return;
    }

    if (method === "POST" && url.pathname === "/minimal-runs/submit-confirmed-survey") {
      await handleMinimalSurveyAction(request, response, "submit-confirmed-survey");
      return;
    }

    if (method === "POST" && url.pathname === "/new-audit/respond-next-question") {
      await handleNewAuditStepperAction(request, response, "respond-next-question");
      return;
    }

    if (method === "POST" && url.pathname === "/new-audit/continue-next-question") {
      await handleNewAuditStepperAction(request, response, "continue-next-question");
      return;
    }

    const statusMatch = url.pathname.match(/^\/runs\/([^/]+)\/status$/);
    if (method === "GET" && statusMatch) {
      await handleStatusRun(statusMatch[1], response);
      return;
    }

    const pauseMatch = url.pathname.match(/^\/runs\/([^/]+)\/pause$/);
    if (method === "POST" && pauseMatch) {
      await handlePauseRun(pauseMatch[1], response);
      return;
    }

    const diagnoseMatch = url.pathname.match(/^\/runs\/([^/]+)\/diagnose$/);
    if (method === "POST" && diagnoseMatch) {
      await handleDiagnoseRun(diagnoseMatch[1], response);
      return;
    }

    const stopMatch = url.pathname.match(/^\/runs\/([^/]+)\/stop$/);
    if (method === "POST" && stopMatch) {
      await handleStopRun(stopMatch[1], response);
      return;
    }

    const payload = {
      ok: false,
      error: "route_not_found",
      detail: "Ruta no encontrada."
    };
    writeJson(response, 404, payload);
    log("warn", "Request completed.", {
      method,
      path: url.pathname,
      origin,
      status: 404,
      body: payload
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servicio operativo.";
    const stack = error instanceof Error ? error.stack ?? null : null;
    const cause =
      error instanceof Error && "cause" in error
        ? (() => {
            const errorCause = (error as Error & { cause?: unknown }).cause;
            if (errorCause instanceof Error) {
              return {
                message: errorCause.message,
                stack: errorCause.stack ?? null
              };
            }
            return errorCause ?? null;
          })()
        : null;
    const rawError =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null
          }
        : (() => {
            try {
              return JSON.parse(JSON.stringify(error));
            } catch {
              return String(error);
            }
          })();
    log("error", "Request failed.", {
      method,
      path: url.pathname,
      origin,
      error: message,
      stack,
      cause,
      rawError
    });

    const payload = {
      ok: false,
      error: "worker_service_error",
      message,
      stack,
      cause,
      rawError
    };
    writeJson(response, 500, payload);
    log("error", "Error response returned.", {
      method,
      path: url.pathname,
      origin,
      status: 500,
      body: payload
    });
  }
});

async function shutdown(signal: string) {
  log("warn", "Shutdown signal received.", {
    signal,
    activeRuns: activeRuns.size
  });

  server.close();

  const activePromises = [...activeRuns.values()].map((entry) => entry.promise);

  await Promise.race([
    Promise.allSettled(activePromises),
    new Promise((resolve) => setTimeout(resolve, shutdownGraceMs))
  ]);

  process.exit(0);
}

try {
  loadEnvConfig(process.cwd());
  assertRequiredEnv();
} catch (error) {
  log("error", "Environment validation failed.", {
    error: error instanceof Error ? error.message : "unknown"
  });
  process.exit(1);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  log("error", "Uncaught exception.", {
    error: error.message
  });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection.", {
    reason: reason instanceof Error ? reason.message : String(reason)
  });
});

server.listen(port, () => {
  log("info", "Pilot worker service listening.", {
    url: `http://0.0.0.0:${port}`,
    maxConcurrentRuns,
    runTimeoutMs
  });
});
