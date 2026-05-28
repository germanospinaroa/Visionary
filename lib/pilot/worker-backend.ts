const DEFAULT_WORKER_API_BASE_URL = "http://127.0.0.1:4001";

function getWorkerApiBaseUrl() {
  return process.env.PILOT_WORKER_API_BASE_URL?.trim() || DEFAULT_WORKER_API_BASE_URL;
}

async function parseJsonResponse(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function callWorkerApi(path: string, init?: RequestInit) {
  const baseUrl = getWorkerApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "No se pudo comunicar el servicio operativo del agente.";

    throw new Error(message);
  }

  return payload;
}

export async function startRemotePilotRun(runId: string) {
  return callWorkerApi("/runs/start", {
    method: "POST",
    body: JSON.stringify({ runId })
  });
}

export async function pauseRemotePilotRun(runId: string) {
  return callWorkerApi(`/runs/${runId}/pause`, {
    method: "POST"
  });
}

export async function stopRemotePilotRun(runId: string) {
  return callWorkerApi(`/runs/${runId}/stop`, {
    method: "POST"
  });
}

export async function getRemotePilotRunStatus(runId: string) {
  return callWorkerApi(`/runs/${runId}/status`, {
    method: "GET"
  });
}

export async function diagnoseRemotePilotRun(runId: string) {
  return callWorkerApi(`/runs/${runId}/diagnose`, {
    method: "POST",
    body: JSON.stringify({ runId })
  });
}
