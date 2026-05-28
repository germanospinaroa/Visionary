import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOpenAIClient } from "@/lib/openai";
import { createBrowserEvent, getSurveyRunDetails, updateSurveyRun } from "@/lib/pilot/db";
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

  writeJson(response, 202, {
    ok: true,
    runId,
    message: "Piloto aceptado por el servicio operativo."
  });
}

async function handlePauseRun(runId: string, response: ServerResponse) {
  await markControlEvent(runId, "pause_requested", "Pausa solicitada por operador.", "paused", "pause_requested");
  log("warn", "Pause requested.", { runId });
  writeJson(response, 200, {
    ok: true,
    runId,
    message: "Pausa solicitada."
  });
}

async function handleStopRun(runId: string, response: ServerResponse) {
  await markControlEvent(runId, "stop_requested", "Detención solicitada por operador.", "failed", "stop_requested");
  log("warn", "Stop requested.", { runId });
  writeJson(response, 200, {
    ok: true,
    runId,
    message: "Detención solicitada."
  });
}

async function handleStatusRun(runId: string, response: ServerResponse) {
  const details = await getSurveyRunDetails(runId);
  const active = activeRuns.get(runId);

  writeJson(response, 200, {
    ok: true,
    runId,
    status: details.run.status,
    currentStep: details.run.current_step,
    currentQuestion: details.run.current_question_text,
    latestEvent: details.events[0] ?? null,
    currentScreenshotUrl: details.currentScreenshotUrl,
    active: Boolean(active),
    startedAt: active ? new Date(active.startedAt).toISOString() : null
  });
}

async function handleDiagnoseRun(runId: string, response: ServerResponse) {
  const diagnostic = await withTimeout(diagnosePilotRunScreen(runId), 30_000, `Pilot diagnose ${runId}`);

  log("info", "Pilot screen diagnosed.", { runId });

  writeJson(response, 200, {
    ok: true,
    runId,
    diagnostic
  });
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

  log("info", "Incoming request.", {
    method,
    path: url.pathname
  });

  try {
    if (method === "GET" && url.pathname === "/health") {
      const dependencies = await getDependencyHealth();
      const ok = dependencies.supabase === "ok" && dependencies.openai === "ok";

      writeJson(response, ok ? 200 : 503, {
        ok,
        activeRuns: activeRuns.size,
        maxConcurrentRuns,
        dependencies
      });
      return;
    }

    if (method === "POST" && url.pathname === "/runs/start") {
      await handleStartRun(request, response);
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

    writeJson(response, 404, {
      message: "Ruta no encontrada."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servicio operativo.";
    log("error", "Request failed.", {
      method,
      path: url.pathname,
      error: message
    });

    writeJson(response, 500, {
      ok: false,
      error: "worker_service_error",
      detail: message
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
