"use client";

import { useEffect, useMemo, useState } from "react";

type EventDetails = {
  step?: string;
  timestamp?: string;
  action?: string;
  evidenceImageId?: string;
  selectorUsed?: string;
  fallbackUsed?: string;
  fillMethod?: string;
  clickStrategy?: string;
  valueBefore?: string;
  valueAfter?: string;
  attemptedSelectors?: string[];
  failedSelectors?: string[];
  detectedInputs?: Array<{
    tag: string;
    type: string;
    name: string;
    id: string;
    placeholder: string;
    visible: boolean;
    disabled: boolean;
  }>;
  detectedButtons?: Array<{
    tag: string;
    text: string;
    type: string;
    name: string;
    id: string;
    value: string;
    visible: boolean;
    disabled: boolean;
  }>;
  [key: string]: unknown;
};

type RunSummary = {
  id: string;
  status: string;
  survey_url: string | null;
  current_step: string | null;
  current_question_index: number | null;
  final_code: string | null;
  created_at: string;
  completed_at: string | null;
  last_error?: string | null;
};

type RunDetails = {
  run: RunSummary & {
    browser_session_id?: string | null;
    browser_config?: {
      selectors?: Record<string, string[]>;
    } | null;
    last_error?: string | null;
    last_heartbeat_at?: string | null;
    current_screenshot_updated_at?: string | null;
    current_question_text?: string | null;
    last_reasoning_summary?: string | null;
    last_selected_option_text?: string | null;
    last_supervisor_decision?: string | null;
  };
  questions: Array<{
    id: string;
    question_index: number;
    detected_question: string | null;
    answers: Array<{
      id: string;
      selected_option_text: string | null;
      confidence: string | null;
      explanation: string | null;
      supervisor_status: string | null;
      evidence_image_id?: string | null;
    }>;
  }>;
  events: Array<{
    id: string;
    level: string;
    event_type: string;
    message: string;
    created_at: string;
    details?: EventDetails;
  }>;
  currentScreenshotUrl: string | null;
  errorScreenshotUrl: string | null;
};

type StartRunResponse = {
  runId: string;
  launchAccepted: boolean;
  message: string;
  detail?: string | null;
};

type BasicActionResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  detail?: string;
  diagnostic?: unknown;
};

type ParsedTextResponse = {
  ok: boolean;
  status: number;
  rawText: string;
  json: Record<string, unknown> | null;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function getStatusTone(status: string) {
  if (status === "completed") {
    return "neutral";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "needs_selector_calibration" || status === "human_review") {
    return "warn";
  }

  if (status === "paused") {
    return "warn";
  }

  return "ok";
}

function getCurrentAction(event: RunDetails["events"][number] | null) {
  if (!event) {
    return "Iniciando navegador del agente…";
  }

  return event.message;
}

function getOperationalStep(step: string | null, questionIndex: number | null) {
  if (!step) {
    return "Preparando ejecución";
  }

  if (step === "created") {
    return "Preparando ejecución";
  }

  if (step === "opening_survey") {
    return "Abriendo encuesta";
  }

  if (step === "initial_screen") {
    return "Ingresando código de tienda";
  }

  if (step === "validator_screen") {
    return "Validando código e imágenes";
  }

  if (step === "question_boot") {
    return "Abriendo primera pregunta";
  }

  if (step === "diagnostics") {
    return "Diagnosticando pantalla";
  }

  if (step === "extracting_images") {
    return "Descargando imágenes";
  }

  if (step === "needs_selector_calibration" || step === "dispatch_failed") {
    return "Requiere calibración";
  }

  if (step === "human_review" || step === "completion_gate") {
    return "Requiere revisión humana";
  }

  if (step === "selecting_used_images") {
    return "Seleccionando imágenes usadas";
  }

  if (step === "completed") {
    return "Encuesta finalizada";
  }

  if (step === "failed") {
    return "Ejecución fallida";
  }

  if (step.startsWith("question_") || step.startsWith("answering_question_")) {
    return `Analizando pregunta ${(questionIndex ?? 0) + 1}`;
  }

  return step.replace(/_/g, " ");
}

function getTimelineEvents(events: RunDetails["events"]) {
  return events
    .filter((event) => event.event_type !== "live_browser_captured")
    .slice(0, 10);
}

function getCalibrationEvents(events: RunDetails["events"]) {
  return events.filter((event) => {
    const selectorUsed = event.details?.selectorUsed;
    const selectorsUsed = event.details?.selectorsUsed;
    return typeof selectorUsed === "string" || Array.isArray(selectorsUsed);
  });
}

function getLatestDiagnosticEvent(events: RunDetails["events"]) {
  return events.find((event) => event.event_type === "screen_diagnostic_saved") ?? null;
}

async function parseResponseAsText(response: Response): Promise<ParsedTextResponse> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      ok: response.ok,
      status: response.status,
      rawText,
      json: null
    };
  }

  try {
    return {
      ok: response.ok,
      status: response.status,
      rawText,
      json: JSON.parse(trimmed) as Record<string, unknown>
    };
  } catch {
    return {
      ok: response.ok,
      status: response.status,
      rawText,
      json: null
    };
  }
}

export function PilotRunner() {
  const [surveyUrl, setSurveyUrl] = useState(process.env.NEXT_PUBLIC_SURVEY_URL ?? "");
  const [storeCode, setStoreCode] = useState("");
  const [validatorCode, setValidatorCode] = useState(process.env.NEXT_PUBLIC_VALIDATOR_CODE ?? "");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<RunDetails | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [selectorDrafts, setSelectorDrafts] = useState<Record<string, string>>({});
  const [isSavingSelectors, setIsSavingSelectors] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [selectorDraftsRunId, setSelectorDraftsRunId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      const response = await fetch("/api/pilot-runs");
      const parsed = await parseResponseAsText(response);
      const payload = (parsed.json ?? {}) as { runs?: RunSummary[] };

      if (cancelled) {
        return;
      }

      if (!activeRunId && payload.runs?.[0]?.id) {
        setActiveRunId(payload.runs[0].id);
      }
    }

    void loadRuns();
    const interval = setInterval(() => void loadRuns(), 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeRunId]);

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    let cancelled = false;

    async function loadRun() {
      const response = await fetch(`/api/pilot-runs/${activeRunId}`);
      const parsed = await parseResponseAsText(response);

      if (!parsed.json) {
        return;
      }

      const payload = parsed.json as unknown as RunDetails;

      if (!cancelled) {
        setActiveRun(payload);
        if (selectorDraftsRunId !== payload.run.id) {
          setSelectorDrafts({
            storeCodeInputSelectors: (payload.run.browser_config?.selectors?.storeCodeInputSelectors ?? []).join("\n"),
            validatorCodeInputSelectors: (payload.run.browser_config?.selectors?.validatorCodeInputSelectors ?? []).join("\n"),
            entryButtonSelectors: (payload.run.browser_config?.selectors?.entryButtonSelectors ?? []).join("\n"),
            startSurveyButtonSelectors: (payload.run.browser_config?.selectors?.startSurveyButtonSelectors ?? []).join("\n")
          });
          setSelectorDraftsRunId(payload.run.id);
        }
      }
    }

    void loadRun();
    const interval = setInterval(() => void loadRun(), 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeRunId]);

  const latestEvent = activeRun?.events[0] ?? null;
  const latestAnswer = useMemo(() => {
    if (!activeRun) {
      return null;
    }

    return [...activeRun.questions]
      .reverse()
      .map((question) => question.answers[0] ?? null)
      .find(Boolean);
  }, [activeRun]);
  const timelineEvents = activeRun ? getTimelineEvents(activeRun.events) : [];
  const calibrationEvents = activeRun ? getCalibrationEvents(activeRun.events).slice(0, 8) : [];
  const latestDiagnosticEvent = activeRun ? getLatestDiagnosticEvent(activeRun.events) : null;
  const currentAction = getCurrentAction(latestEvent);
  const currentStep = activeRun
    ? getOperationalStep(activeRun.run.current_step, activeRun.run.current_question_index)
    : "Preparando ejecución";

  async function onExecute() {
    setIsSubmitting(true);
    setErrorNotice(null);
    setStatusNotice("Iniciando navegador del agente…");

    try {
      const response = await fetch("/api/pilot-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          surveyUrl,
          storeCode,
          validatorCode
        })
      });

      const parsed = await parseResponseAsText(response);
      const payload = (parsed.json ?? {}) as StartRunResponse & { error?: string; detail?: string };

      if (!parsed.ok) {
        throw new Error(payload.detail ?? payload.error ?? payload.message ?? "No se pudo ejecutar el piloto.");
      }

      setActiveRunId(payload.runId);

      if (payload.launchAccepted === false) {
        setErrorNotice(payload.detail ?? payload.message);
      } else {
        setStatusNotice(payload.message);
      }
    } catch (error) {
      setStatusNotice(null);
      setErrorNotice(error instanceof Error ? error.message : "No se pudo ejecutar el piloto.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onPause() {
    if (!activeRunId) {
      return;
    }

    setIsPausing(true);
    setErrorNotice(null);

    try {
      const response = await fetch(`/api/pilot-runs/${activeRunId}/pause`, {
        method: "POST"
      });
      const parsed = await parseResponseAsText(response);
      const payload = (parsed.json ?? {}) as { message?: string; error?: string; detail?: string };

      if (!parsed.ok) {
        throw new Error(payload.detail ?? payload.error ?? payload.message ?? "No se pudo pausar el piloto.");
      }

      setStatusNotice(payload.message ?? "Piloto pausado.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "No se pudo pausar el piloto.");
    } finally {
      setIsPausing(false);
    }
  }

  async function onStop() {
    if (!activeRunId) {
      return;
    }

    setIsStopping(true);
    setErrorNotice(null);

    try {
      const response = await fetch(`/api/pilot-runs/${activeRunId}/stop`, {
        method: "POST"
      });
      const parsed = await parseResponseAsText(response);
      const payload = (parsed.json ?? {}) as { message?: string; error?: string; detail?: string };

      if (!parsed.ok) {
        throw new Error(payload.detail ?? payload.error ?? payload.message ?? "No se pudo detener el piloto.");
      }

      setStatusNotice(payload.message ?? "Piloto detenido.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "No se pudo detener el piloto.");
    } finally {
      setIsStopping(false);
    }
  }

  async function onSaveCalibration() {
    if (!activeRunId) {
      return;
    }

    setIsSavingSelectors(true);
    setErrorNotice(null);

    try {
      const selectors = Object.fromEntries(
        Object.entries(selectorDrafts).map(([key, value]) => [
          key,
          value
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        ])
      );

      const response = await fetch(`/api/pilot-runs/${activeRunId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ selectors })
      });
      const parsed = await parseResponseAsText(response);
      const payload = (parsed.json ?? {}) as { message?: string; error?: string; detail?: string };

      if (!parsed.ok) {
        throw new Error(payload.detail ?? payload.error ?? payload.message ?? "No se pudo guardar la calibración.");
      }

      setSelectorDraftsRunId(null);
      setStatusNotice(payload.message ?? "Calibración guardada.");
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "No se pudo guardar la calibración.");
    } finally {
      setIsSavingSelectors(false);
    }
  }

  async function onDiagnoseScreen() {
    if (!activeRunId) {
      return;
    }

    setIsDiagnosing(true);
    setErrorNotice(null);

    try {
      const response = await fetch(`/api/pilot-runs/${activeRunId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          action: "diagnose"
        })
      });
      const parsed = await parseResponseAsText(response);
      const payload = (parsed.json ?? {}) as BasicActionResponse;

      if (!parsed.ok) {
        if (!parsed.rawText.trim()) {
          throw new Error(
            `Diagnóstico falló con status ${parsed.status} en /api/pilot-runs/${activeRunId}. Respuesta vacía.`
          );
        }

        if (!parsed.json) {
          throw new Error(
            `Diagnóstico falló con status ${parsed.status} en /api/pilot-runs/${activeRunId}. Body crudo: ${parsed.rawText}`
          );
        }

        throw new Error(payload.detail ?? payload.error ?? payload.message ?? "No se pudo ejecutar el diagnóstico.");
      }

      if (payload.ok === false) {
        const partial =
          payload.diagnostic && typeof payload.diagnostic === "object" && "partial" in payload.diagnostic
            ? payload.diagnostic.partial
            : null;
        const partialSummary =
          partial && typeof partial === "object"
            ? ` URL: ${String((partial as Record<string, unknown>).url ?? "n/a")}.`
            : "";
        throw new Error(
          `${payload.detail ?? payload.error ?? "El diagnóstico remoto falló dentro del worker."}${partialSummary}`
        );
      }

      setStatusNotice(
        payload.diagnostic
          ? "Diagnóstico ejecutado. Revisa inputs, botones y captura en el panel."
          : "Diagnóstico ejecutado."
      );
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : "No se pudo ejecutar el diagnóstico.");
    } finally {
      setIsDiagnosing(false);
    }
  }

  return (
    <section className="pilot-console">
      <header className="pilot-hero">
        <div>
          <span className="eyebrow">Retail Visual Audit Pilot</span>
          <h1>Retail Visual Audit Pilot</h1>
          <p>Operational AI-assisted retail audit workflow.</p>
        </div>
        {activeRun ? (
          <div className="hero-status">
            <span className={`badge tone-${getStatusTone(activeRun.run.status)}`}>{activeRun.run.status}</span>
            <span className="hero-runid">Run {activeRun.run.id}</span>
          </div>
        ) : null}
      </header>

      <div className="pilot-main-layout">
        <section className="card control-panel">
          <div className="panel-header">
            <span className="eyebrow">Configuración</span>
            <h2>Ejecutar piloto</h2>
          </div>

          {statusNotice ? <div className="banner-info">{statusNotice}</div> : null}
          {errorNotice ? <div className="banner-error">{errorNotice}</div> : null}

          <div className="field">
            <label htmlFor="surveyUrl">Survey URL</label>
            <input id="surveyUrl" value={surveyUrl} onChange={(event) => setSurveyUrl(event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="storeCode">Store Code</label>
            <input id="storeCode" value={storeCode} onChange={(event) => setStoreCode(event.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="validatorCode">Validator Code</label>
            <input
              id="validatorCode"
              value={validatorCode}
              onChange={(event) => setValidatorCode(event.target.value)}
            />
          </div>

          <div className="control-actions">
            <button className="button" type="button" onClick={onExecute} disabled={isSubmitting}>
              {isSubmitting ? "Ejecutando…" : "Ejecutar piloto"}
            </button>
            <button className="button secondary" type="button" onClick={onPause} disabled={!activeRunId || isPausing}>
              {isPausing ? "Pausando…" : "Pausar"}
            </button>
            <button className="button secondary danger" type="button" onClick={onStop} disabled={!activeRunId || isStopping}>
              {isStopping ? "Deteniendo…" : "Detener"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={onDiagnoseScreen}
              disabled={!activeRunId || isDiagnosing}
            >
              {isDiagnosing ? "Diagnosticando…" : "Diagnosticar pantalla actual"}
            </button>
          </div>

          <div className="status-card">
            <span className="status-label">Estado</span>
            <strong>{activeRun?.run.status ?? "Idle"}</strong>
            <span>{currentStep}</span>
          </div>
        </section>

        <section className="card live-browser-panel">
          <div className="live-browser-header">
            <div>
              <span className="eyebrow">Live Browser</span>
              <h2>Live Browser</h2>
            </div>
            {activeRun ? (
              <div className="live-browser-tags">
                <span>Run ID: {activeRun.run.id}</span>
                <span>Heartbeat: {formatTimestamp(activeRun.run.last_heartbeat_at)}</span>
              </div>
            ) : null}
          </div>

          <div className="live-browser-statusbar">
            <span>Estado actual: {activeRun?.run.status ?? "preparando"}</span>
            <span>Paso actual: {currentStep}</span>
            <span>Última acción: {latestEvent?.message ?? "Iniciando navegador del agente…"}</span>
          </div>

          <div className="browser-shell">
            <div className="browser-chrome">
              <span className="browser-dot red" />
              <span className="browser-dot amber" />
              <span className="browser-dot green" />
              <div className="browser-address">{activeRun?.run.survey_url ?? surveyUrl ?? "Cargando destino"}</div>
            </div>
            <div className="browser-stage">
              {activeRun?.currentScreenshotUrl ? (
                <img
                  className="live-browser-image"
                  src={`${activeRun.currentScreenshotUrl}&t=${Date.now()}`}
                  alt="Live browser"
                />
              ) : (
                <div className="browser-empty">
                  Aún no hay vista del navegador. El agente está iniciando o preparando la navegación.
                </div>
              )}
            </div>
          </div>

          <div className="live-browser-footer">
            <span>Última captura: {formatTimestamp(activeRun?.run.current_screenshot_updated_at)}</span>
            <span>Página visible: {activeRun?.run.current_question_text ?? "Cargando contexto de encuesta"}</span>
          </div>

          <p className="live-browser-action">Acción actual: {currentAction}</p>
        </section>
      </div>

      <div className="pilot-secondary-layout">
        <section className="card agent-status-panel">
          <div className="panel-header">
            <span className="eyebrow">Agent Status</span>
            <h2>Estado del agente</h2>
          </div>

          <div className="status-detail-list">
            <article className="status-detail">
              <span>Current Step</span>
              <strong>{currentStep}</strong>
            </article>
            <article className="status-detail">
              <span>Current Question</span>
              <strong>{activeRun?.run.current_question_text ?? "Aún sin pregunta detectada"}</strong>
            </article>
            <article className="status-detail">
              <span>Selected Answer</span>
              <strong>{activeRun?.run.last_selected_option_text ?? "Pendiente"}</strong>
            </article>
            <article className="status-detail">
              <span>Confidence</span>
              <strong>{latestAnswer?.confidence ?? "Pendiente"}</strong>
            </article>
            <article className="status-detail">
              <span>Supervisor Decision</span>
              <strong>{activeRun?.run.last_supervisor_decision ?? "Pendiente"}</strong>
            </article>
            <article className="status-detail">
              <span>Image Used</span>
              <strong>{latestAnswer?.evidence_image_id ?? "Pendiente"}</strong>
            </article>
            <article className="status-detail full">
              <span>Reasoning Summary</span>
              <strong>{activeRun?.run.last_reasoning_summary ?? "Aún no hay explicación operacional disponible."}</strong>
            </article>
            {activeRun?.run.last_error ? (
              <article className="status-detail full danger">
                <span>Error</span>
                <strong>{activeRun.run.last_error}</strong>
              </article>
            ) : null}
          </div>
        </section>

        <section className="card advanced-panel">
          <div className="panel-header">
            <span className="eyebrow">Advanced</span>
            <h2>Calibración</h2>
          </div>
          <details>
            <summary>Ver panel avanzado de calibración</summary>
            <p className="advanced-copy">
              Úsalo solo si el survey requiere ajustar selectores. La operación normal no necesita este panel.
            </p>
            <div className="advanced-grid">
              <div className="field">
                <label htmlFor="storeSelectors">Selector campo tienda</label>
                <textarea
                  id="storeSelectors"
                  value={selectorDrafts.storeCodeInputSelectors ?? ""}
                  onChange={(event) =>
                    setSelectorDrafts((current) => ({ ...current, storeCodeInputSelectors: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="entrySelectors">Selector botón Entrar</label>
                <textarea
                  id="entrySelectors"
                  value={selectorDrafts.entryButtonSelectors ?? ""}
                  onChange={(event) =>
                    setSelectorDrafts((current) => ({ ...current, entryButtonSelectors: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="validatorSelectors">Selector campo validador</label>
                <textarea
                  id="validatorSelectors"
                  value={selectorDrafts.validatorCodeInputSelectors ?? ""}
                  onChange={(event) =>
                    setSelectorDrafts((current) => ({ ...current, validatorCodeInputSelectors: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="startSurveySelectors">Selector botón iniciar encuesta</label>
                <textarea
                  id="startSurveySelectors"
                  value={selectorDrafts.startSurveyButtonSelectors ?? ""}
                  onChange={(event) =>
                    setSelectorDrafts((current) => ({ ...current, startSurveyButtonSelectors: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="actions">
              <button className="button secondary" type="button" onClick={onSaveCalibration} disabled={isSavingSelectors}>
                {isSavingSelectors ? "Guardando…" : "Guardar calibración"}
              </button>
            </div>
            {calibrationEvents.length > 0 ? (
              <div className="timeline-list">
                {calibrationEvents.map((event) => (
                  <article key={event.id} className="timeline-item">
                    <span className="timeline-time">{formatTimestamp(event.created_at)}</span>
                    <strong>{event.message}</strong>
                    <span className="timeline-step">
                      {typeof event.details?.selectorUsed === "string"
                        ? `Selector: ${event.details.selectorUsed}`
                        : Array.isArray(event.details?.selectorsUsed)
                          ? `Selectores: ${event.details.selectorsUsed.join(", ")}`
                          : "Sin selector"}
                    </span>
                    {typeof event.details?.fallbackUsed === "string" ? (
                      <span className="timeline-step">Fallback: {event.details.fallbackUsed}</span>
                    ) : null}
                    {typeof event.details?.fillMethod === "string" ? (
                      <span className="timeline-step">Método: {event.details.fillMethod}</span>
                    ) : null}
                    {typeof event.details?.clickStrategy === "string" ? (
                      <span className="timeline-step">Click: {event.details.clickStrategy}</span>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="timeline-empty">Aún no hay trazas de calibración de selectores.</div>
            )}
          </details>
        </section>
      </div>

      <section className="card timeline-panel">
        <div className="panel-header">
          <span className="eyebrow">Timeline</span>
          <h2>Secuencia operativa</h2>
        </div>
        <div className="timeline-list">
          {timelineEvents.length > 0 ? (
            timelineEvents.map((event) => (
              <article key={event.id} className={`timeline-item level-${event.level}`}>
                <span className="timeline-time">{formatTimestamp(event.created_at)}</span>
                <strong>{event.message}</strong>
                <span className="timeline-step">{event.details?.step?.replace(/_/g, " ") ?? "proceso"}</span>
                {typeof event.details?.selectorUsed === "string" ? (
                  <span className="timeline-step">Selector: {event.details.selectorUsed}</span>
                ) : null}
                {typeof event.details?.fallbackUsed === "string" ? (
                  <span className="timeline-step">Fallback: {event.details.fallbackUsed}</span>
                ) : null}
                {typeof event.details?.fillMethod === "string" ? (
                  <span className="timeline-step">Método: {event.details.fillMethod}</span>
                ) : null}
                {typeof event.details?.clickStrategy === "string" ? (
                  <span className="timeline-step">Click: {event.details.clickStrategy}</span>
                ) : null}
                {typeof event.details?.valueAfter === "string" ? (
                  <span className="timeline-step">Valor confirmado: {event.details.valueAfter}</span>
                ) : null}
              </article>
            ))
          ) : (
            <div className="timeline-empty">La línea de tiempo aparecerá cuando el agente comience a interactuar con la encuesta.</div>
          )}
        </div>
      </section>

      {latestDiagnosticEvent ? (
        <section className="card timeline-panel">
          <div className="panel-header">
            <span className="eyebrow">Diagnóstico</span>
            <h2>Pantalla actual</h2>
          </div>
          <div className="timeline-list">
            <article className="timeline-item">
              <span className="timeline-time">{formatTimestamp(latestDiagnosticEvent.created_at)}</span>
              <strong>{latestDiagnosticEvent.message}</strong>
              {typeof latestDiagnosticEvent.details?.selectorUsed === "string" ? (
                <span className="timeline-step">Selector intentado: {latestDiagnosticEvent.details.selectorUsed}</span>
              ) : null}
              {Array.isArray(latestDiagnosticEvent.details?.attemptedSelectors) ? (
                <span className="timeline-step">
                  Intentos: {latestDiagnosticEvent.details.attemptedSelectors.join(" | ")}
                </span>
              ) : null}
              {typeof latestDiagnosticEvent.details?.fallbackUsed === "string" ? (
                <span className="timeline-step">Fallback usado: {latestDiagnosticEvent.details.fallbackUsed}</span>
              ) : null}
            </article>
          </div>
          <div className="advanced-grid">
            <div className="field">
              <label>Inputs detectados</label>
              <div className="diagnostic-list">
                {latestDiagnosticEvent.details?.detectedInputs?.length ? (
                  latestDiagnosticEvent.details.detectedInputs.map((input, index) => (
                    <div key={`input-${index}`} className="diagnostic-item">
                      {`${input.tag} type=${input.type || "-"} name=${input.name || "-"} id=${input.id || "-"} placeholder=${input.placeholder || "-"} visible=${String(input.visible)} disabled=${String(input.disabled)}`}
                    </div>
                  ))
                ) : (
                  <div className="timeline-empty">No hay inputs diagnosticados.</div>
                )}
              </div>
            </div>
            <div className="field">
              <label>Botones detectados</label>
              <div className="diagnostic-list">
                {latestDiagnosticEvent.details?.detectedButtons?.length ? (
                  latestDiagnosticEvent.details.detectedButtons.map((button, index) => (
                    <div key={`button-${index}`} className="diagnostic-item">
                      {`${button.tag} text=${button.text || button.value || "-"} type=${button.type || "-"} visible=${String(button.visible)} disabled=${String(button.disabled)}`}
                    </div>
                  ))
                ) : (
                  <div className="timeline-empty">No hay botones diagnosticados.</div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
