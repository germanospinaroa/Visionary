"use client";

import { useEffect, useState } from "react";
import { ResultCard } from "@/components/result-card";
import type { AnalysisResult, AnalyzeError } from "@/lib/schema";

type FormErrors = {
  mainImageUrl?: string;
  questionnaireImage?: string;
};

function isAnalyzeError(payload: AnalysisResult | AnalyzeError): payload is AnalyzeError {
  return "error" in payload && "detail" in payload;
}

function getReadableApiError(payload: AnalyzeError) {
  switch (payload.error) {
    case "image_fetch_failed":
    case "not_an_image":
    case "invalid_url":
    case "missing_file":
    case "unsupported_file":
      return payload.detail;
    case "missing_api_key":
      return "Falta configurar la clave del servicio de análisis.";
    case "invalid_model_response":
      return "El servicio de análisis devolvió una respuesta no válida. Inténtalo otra vez.";
    default:
      return "Ocurrió un error inesperado al procesar la solicitud.";
  }
}

function Preview({
  title,
  src,
  alt
}: {
  title: string;
  src: string | null;
  alt: string;
}) {
  return (
    <article className="preview-card">
      <header>{title}</header>
      <div className="preview-frame">
        {src ? (
          <img src={src} alt={alt} />
        ) : (
          <div className="preview-placeholder">Aún no hay vista previa disponible.</div>
        )}
      </div>
    </article>
  );
}

export function AnalysisForm() {
  const [mainImageUrl, setMainImageUrl] = useState("");
  const [questionnaireImage, setQuestionnaireImage] = useState<File | null>(null);
  const [questionnairePreviewUrl, setQuestionnairePreviewUrl] = useState<string | null>(null);
  const [manualQuestion, setManualQuestion] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (!questionnaireImage) {
      setQuestionnairePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(questionnaireImage);
    setQuestionnairePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [questionnaireImage]);

  const validate = () => {
    const nextErrors: FormErrors = {};

    if (!mainImageUrl.trim()) {
      nextErrors.mainImageUrl = "La URL de la imagen principal es obligatoria.";
    } else {
      try {
        const parsed = new URL(mainImageUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          nextErrors.mainImageUrl = "Usa una URL que empiece por http o https.";
        }
      } catch {
        nextErrors.mainImageUrl = "Introduce una URL válida.";
      }
    }

    if (!questionnaireImage) {
      nextErrors.questionnaireImage = "Debes subir una imagen del cuestionario.";
    } else if (!questionnaireImage.type.startsWith("image/")) {
      nextErrors.questionnaireImage = "El archivo del cuestionario debe ser una imagen.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setQuestionnaireImage(file);
    setResult(null);
    setApiError(null);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    if (!questionnaireImage) {
      return;
    }

    const formData = new FormData();
    formData.append("mainImageUrl", mainImageUrl.trim());
    formData.append("questionnaireImage", questionnaireImage);

    if (manualQuestion.trim()) {
      formData.append("manualQuestion", manualQuestion.trim());
    }

    if (additionalContext.trim()) {
      formData.append("additionalContext", additionalContext.trim());
    }

    setIsSubmitting(true);
    setApiError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as AnalysisResult | AnalyzeError;

      if (!response.ok && isAnalyzeError(payload)) {
        setApiError(getReadableApiError(payload));
        return;
      }

      setResult(payload as AnalysisResult);
    } catch {
      setApiError("No se pudo completar la solicitud. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid">
      <section className="form-card card">
        <h2 className="section-title">Entradas</h2>
        <p className="section-copy">
          El sistema leerá primero el cuestionario actual, clasificará el tipo de
          pregunta, buscará el producto en crops ampliados y escalará a un segundo
          pase de mayor precisión solo si la evidencia o la confianza no alcanzan.
        </p>

        {apiError ? <div className="banner-error">{apiError}</div> : null}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="mainImageUrl">URL de la imagen principal</label>
            <input
              id="mainImageUrl"
              name="mainImageUrl"
              type="url"
              placeholder="https://ejemplo.com/imagen-principal.jpg"
              value={mainImageUrl}
              onChange={(event) => setMainImageUrl(event.target.value)}
            />
            <span className="hint">
              Debe ser una URL pública accesible por el servidor.
            </span>
            {errors.mainImageUrl ? <div className="inline-error">{errors.mainImageUrl}</div> : null}
          </div>

          <div className="field">
            <label htmlFor="questionnaireImage">Subir imagen del cuestionario</label>
            <input
              id="questionnaireImage"
              name="questionnaireImage"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onFileChange}
            />
            <span className="hint">
              Usa una captura donde se vean la pregunta, el ejemplo visual, la
              zona resaltada, el contexto escrito y las opciones de respuesta.
            </span>
            {errors.questionnaireImage ? (
              <div className="inline-error">{errors.questionnaireImage}</div>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="manualQuestion">Pregunta manual</label>
            <textarea
              id="manualQuestion"
              name="manualQuestion"
              placeholder="Opcional. Úsalo si quieres sobrescribir el texto detectado en la captura."
              value={manualQuestion}
              onChange={(event) => setManualQuestion(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="additionalContext">Contexto adicional</label>
            <textarea
              id="additionalContext"
              name="additionalContext"
              placeholder="Opcional. Ejemplo: El producto buscado es el que aparece marcado en la captura; prioriza su ubicación y contexto visual."
              value={additionalContext}
              onChange={(event) => setAdditionalContext(event.target.value)}
            />
            <span className="hint">
              Úsalo para reglas operativas explícitas. No sustituye la evidencia visual.
            </span>
          </div>

          <div className="actions">
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Analizando..." : "Analizar"}
            </button>
          </div>
        </form>

        <div className="preview-grid">
          <Preview
            title="Imagen principal"
            src={mainImageUrl.trim() ? mainImageUrl.trim() : null}
            alt="Vista previa de la imagen principal"
          />
          <Preview
            title="Imagen del cuestionario"
            src={questionnairePreviewUrl}
            alt="Vista previa de la imagen del cuestionario"
          />
        </div>
      </section>

      <ResultCard result={result} />
    </div>
  );
}
