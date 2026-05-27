"use client";

import type { AnalysisResult } from "@/lib/schema";

function answerClassName(answer: AnalysisResult["respuesta"]) {
  if (answer === "sí") {
    return "badge answer-si";
  }

  if (answer === "no") {
    return "badge answer-no";
  }

  return "badge answer-no-se";
}

function renderStringList(items: string[], emptyLabel: string) {
  if (items.length === 0) {
    return <p>{emptyLabel}</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function renderDetectedOptions(options: AnalysisResult["opciones_detectadas"]) {
  if (options.length === 0) {
    return <p>No se detectaron opciones visibles con suficiente claridad.</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {options.map((option, index) => (
        <li key={`${option.label}-${index}`}>
          <strong>{option.label}</strong>: {option.texto}
        </li>
      ))}
    </ul>
  );
}

function renderRuleSources(sources: AnalysisResult["fuentes_de_reglas"]) {
  if (sources.length === 0) {
    return <p>No se registraron fuentes explícitas de reglas.</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {sources.map((source, index) => (
        <li key={`${source.regla}-${index}`}>
          <strong>{source.fuente}</strong>: {source.regla}
        </li>
      ))}
    </ul>
  );
}

function renderZoneSearch(search: AnalysisResult["target_product_search"]["busqueda_por_zonas"]) {
  if (search.length === 0) {
    return <p>No se registró búsqueda por zonas.</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {search.map((zone, index) => (
        <li key={`${zone.zona}-${index}`}>
          <strong>{zone.zona}</strong>:{" "}
          {zone.producto_detectado === null
            ? "sin confirmación"
            : zone.producto_detectado
              ? "detectado"
              : "no detectado"}{" "}
          ({zone.confianza}) - {zone.evidencia}
        </li>
      ))}
    </ul>
  );
}

function applicabilityDecisionLabel(
  decision: NonNullable<AnalysisResult["condicion_aplicabilidad"]>["decision"]
) {
  return decision === "aplicar_pregunta" ? "Aplicar pregunta" : "No aplicar pregunta";
}

function supervisorDecisionLabel(status: AnalysisResult["decision_supervisor"]["status"]) {
  switch (status) {
    case "approve":
      return "Aprobar";
    case "reject":
      return "Rechazar";
    case "force_no_puedo_responder":
      return "Forzar No puedo responder";
    case "retry_with_new_crops":
      return "Reintentar con nuevos crops";
  }
}

export function ResultCard({ result }: { result: AnalysisResult | null }) {
  const downloadJson = () => {
    if (!result) {
      return;
    }

    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resultado-analisis.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!result) {
    return (
      <div className="result-card card">
        <div className="result-empty">
          <div>
            <h2 className="section-title">Resultado</h2>
            <p className="section-copy">
              Cuando ejecutes el análisis, aquí verás primero las reglas
              detectadas del cuestionario y luego la respuesta final con su JSON.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="result-card card">
      <h2 className="section-title">Resultado</h2>
      <p className="section-copy">
        Respuesta estructurada del agente visual, incluyendo clasificación de la
        pregunta, criterio real de evaluación, trazabilidad y decisión de supervisor.
      </p>

      <div className="badge-row">
        <div className={answerClassName(result.respuesta)}>
          Conclusión interna: {result.respuesta}
        </div>
        <div className="badge">Confianza: {result.confianza}</div>
      </div>

      <div className="result-grid">
        <section className="result-block">
          <h3>Tipo de pregunta</h3>
          <p>{result.tipo_de_pregunta}</p>
        </section>
        <section className="result-block">
          <h3>Gate de aplicabilidad</h3>
          <p>
            {result.condicion_aplicabilidad
              ? applicabilityDecisionLabel(result.condicion_aplicabilidad.decision)
              : "No aplica: no se detectó una condición previa explícita."}
          </p>
        </section>
        <section className="result-block">
          <h3>Respuesta final seleccionada</h3>
          <p>
            <strong>{result.respuesta_final_label}</strong>: {result.respuesta_final_texto}
          </p>
        </section>
        <section className="result-block">
          <h3>Pregunta detectada</h3>
          <p>{result.pregunta_detectada ?? "No se pudo detectar con claridad."}</p>
        </section>
        <section className="result-block">
          <h3>Producto objetivo</h3>
          <p>{result.target_product_search.producto_objetivo}</p>
        </section>
        <section className="result-block full">
          <h3>Estrategia visual sugerida</h3>
          <p>{result.estrategia_visual_sugerida}</p>
        </section>
        <section className="result-block">
          <h3>Criterio real de evaluación</h3>
          <p>{result.criterio_real_de_evaluacion}</p>
        </section>
        <section className="result-block">
          <h3>No puedo responder</h3>
          <p>{result.no_puedo_responder ? "Sí" : "No"}</p>
          <p>{result.motivo_no_puedo_responder || "No aplica."}</p>
        </section>
        <section className="result-block full">
          <h3>Instrucciones detectadas</h3>
          {renderStringList(
            result.instrucciones_detectadas,
            "No se detectaron instrucciones explícitas con suficiente claridad."
          )}
        </section>
        <section className="result-block full">
          <h3>Aclaraciones detectadas</h3>
          {renderStringList(
            result.aclaraciones_detectadas,
            "No se detectaron aclaraciones o excepciones explícitas."
          )}
        </section>
        <section className="result-block full">
          <h3>Condiciones previas</h3>
          {renderStringList(
            result.condiciones_previas,
            "No se detectaron condiciones previas explícitas."
          )}
        </section>
        <section className="result-block full">
          <h3>Fuentes de reglas</h3>
          {renderRuleSources(result.fuentes_de_reglas)}
        </section>
        <section className="result-block full">
          <h3>Reglas descartadas por contaminación</h3>
          {renderStringList(
            result.reglas_descartadas_por_contaminacion,
            "No se descartaron reglas por contaminación contextual."
          )}
        </section>
        <section className="result-block full">
          <h3>Condición de aplicabilidad</h3>
          {result.condicion_aplicabilidad ? (
            <>
              <p>
                <strong>Descripción:</strong> {result.condicion_aplicabilidad.descripcion}
              </p>
              <p>
                <strong>Se cumple:</strong>{" "}
                {result.condicion_aplicabilidad.se_cumple === null
                  ? "No se pudo confirmar"
                  : result.condicion_aplicabilidad.se_cumple
                    ? "Sí"
                    : "No"}
              </p>
              <p>
                <strong>Confianza:</strong> {result.condicion_aplicabilidad.confianza}
              </p>
              <p>
                <strong>Evidencia:</strong> {result.condicion_aplicabilidad.evidencia}
              </p>
              <p>
                <strong>Decisión:</strong>{" "}
                {applicabilityDecisionLabel(result.condicion_aplicabilidad.decision)}
              </p>
            </>
          ) : (
            <p>No se detectó una condición previa explícita ni visualmente representada.</p>
          )}
        </section>
        <section className="result-block full">
          <h3>Opciones detectadas</h3>
          {renderDetectedOptions(result.opciones_detectadas)}
        </section>
        <section className="result-block full">
          <h3>Target Product Search</h3>
          <p>
            <strong>Producto confirmado:</strong>{" "}
            {result.target_product_search.producto_confirmado === null
              ? "No se pudo confirmar"
              : result.target_product_search.producto_confirmado
                ? "Sí"
                : "No"}
          </p>
          <p>
            <strong>Mejor zona detectada:</strong>{" "}
            {result.target_product_search.mejor_zona_detectada || "Sin zona concluyente."}
          </p>
          <p>
            <strong>Ubicación en imagen principal:</strong>{" "}
            {result.target_product_search.ubicacion_en_imagen_principal}
          </p>
          {renderZoneSearch(result.target_product_search.busqueda_por_zonas)}
        </section>
        <section className="result-block full">
          <h3>Análisis de aplicabilidad</h3>
          <p>{result.analisis_de_aplicabilidad}</p>
        </section>
        <section className="result-block full">
          <h3>Conclusión lógica</h3>
          <p>{result.conclusion_logica}</p>
        </section>
        <section className="result-block full">
          <h3>Razón de mapeo</h3>
          <p>{result.razon_de_mapeo}</p>
        </section>
        <section className="result-block">
          <h3>Elemento buscado</h3>
          <p>{result.elemento_buscado}</p>
        </section>
        <section className="result-block full">
          <h3>Explicación breve</h3>
          <p>{result.explicacion}</p>
        </section>
        <section className="result-block full">
          <h3>Evidencia visual observada</h3>
          <p>{result.evidencia_visual}</p>
        </section>
        <section className="result-block full">
          <h3>Evidencia trazable</h3>
          <p>
            <strong>Imagen:</strong> {result.evidencia_trazable.image_asset}
          </p>
          <p>
            <strong>Crop:</strong> {result.evidencia_trazable.crop_asset}
          </p>
          <p>
            <strong>Coordenadas:</strong> {result.evidencia_trazable.coordinates}
          </p>
          <p>
            <strong>Sección:</strong> {result.evidencia_trazable.section}
          </p>
          <p>
            <strong>OCR:</strong> {result.evidencia_trazable.ocr_evidence}
          </p>
        </section>
        <section className="result-block full">
          <h3>Decisión de supervisor</h3>
          <p>
            <strong>Estado:</strong> {supervisorDecisionLabel(result.decision_supervisor.status)}
          </p>
          <p>
            <strong>Riesgo de alucinación:</strong> {result.decision_supervisor.hallucination_risk}
          </p>
          <p>
            <strong>Razón:</strong> {result.decision_supervisor.rationale}
          </p>
          <p>
            <strong>Acción pedida:</strong> {result.decision_supervisor.requested_action}
          </p>
        </section>
        <section className="result-block full">
          <h3>Advertencias</h3>
          <p>{result.advertencias || "Sin advertencias adicionales."}</p>
        </section>
        <section className="result-block full">
          <h3>JSON crudo</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button className="button secondary" type="button" onClick={downloadJson}>
          Descargar JSON
        </button>
      </div>
    </div>
  );
}
