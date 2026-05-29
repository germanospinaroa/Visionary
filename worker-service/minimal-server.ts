import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { runMinimalSurveyFlow } from "@/lib/pilot/minimal-worker";

const port = Number(process.env.PILOT_MINIMAL_WORKER_PORT ?? 4011);

type MinimalRunRequest = {
  surveyUrl?: string;
  storeCode?: string;
  validatorCode?: string;
};

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as MinimalRunRequest;
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");

  if (method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method !== "POST" || url.pathname !== "/minimal-runs/start") {
    writeJson(response, 404, {
      ok: false,
      error: "route_not_found"
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const surveyUrl = body.surveyUrl?.trim() ?? "";
    const storeCode = body.storeCode?.trim() ?? "";
    const validatorCode = body.validatorCode?.trim() ?? "";

    if (!surveyUrl || !storeCode || !validatorCode) {
      writeJson(response, 400, {
        ok: false,
        error: "missing_required_fields"
      });
      return;
    }

    const result = await runMinimalSurveyFlow({
      surveyUrl,
      storeCode,
      validatorCode
    });

    writeJson(response, result.ok ? 200 : 500, result);
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      finalUrl: null,
      title: null,
      currentStep: "server_error",
      screenshots: [],
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null
    });
  }
});

server.listen(port, () => {
  console.log(
    JSON.stringify({
      scope: "minimal-worker-service",
      event: "listening",
      url: `http://0.0.0.0:${port}`,
      timestamp: new Date().toISOString()
    })
  );
});
