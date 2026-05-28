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

async function parseTextResponse(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function callWorkerApi(path: string, init?: RequestInit) {
  const baseUrl = getWorkerApiBaseUrl();
  const targetUrl = `${baseUrl}${path}`;

  let response: Response;

  try {
    response = await fetch(targetUrl, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_fetch_error";
    throw new Error(`Fetch al worker falló: ${targetUrl}. Detalle: ${reason}`);
  }

  const clonedResponse = response.clone();
  const payload = await parseJsonResponse(response);
  const rawBody = await parseTextResponse(clonedResponse);

  if (!response.ok) {
    const messageParts = [
      `Worker respondió error: ${response.status} ${response.statusText}.`,
      `URL: ${targetUrl}.`
    ];

    if (typeof payload.detail === "string" && payload.detail.trim()) {
      messageParts.push(`Detalle: ${payload.detail}`);
    } else if (typeof payload.message === "string" && payload.message.trim()) {
      messageParts.push(`Detalle: ${payload.message}`);
    } else if (rawBody.trim()) {
      messageParts.push(`Body: ${rawBody}`);
    }

    throw new Error(messageParts.join(" "));
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
