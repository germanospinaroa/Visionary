import { chromium, type Locator, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { fetchRemoteImage } from "@/lib/image";
import { runVisualAnalysis } from "@/lib/analysis/run-visual-analysis";
import {
  createBrowserEvent,
  createImageRecord,
  createQuestionRecord,
  getSurveyRunDetails,
  updateSurveyRun,
  upsertAnswerRecord
} from "@/lib/pilot/db";
import { createSignedStorageUrl, uploadBufferToStorage, uploadJsonArtifact } from "@/lib/pilot/storage";
import { mergePilotBrowserConfig } from "@/lib/pilot/config";
import type { ExtractedSurveyImage, SurveySelectorConfig } from "@/lib/pilot/types";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function firstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        if (await locator.isVisible()) {
          return locator;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function fillFirstAvailable(page: Page, selectors: string[], value: string) {
  const locator = await firstVisible(page, selectors);

  if (!locator) {
    throw new Error(`No se encontró un input para completar valor: ${value}.`);
  }

  await locator.fill(value);
}

async function clickNext(page: Page, selectors: string[]) {
  const locator = await firstVisible(page, selectors);

  if (!locator) {
    throw new Error("No se encontró botón para avanzar.");
  }

  await locator.click();
}

async function pageLooksLikeUsedImages(page: Page) {
  const text = normalizeText(await page.locator("body").innerText());
  return (
    text.includes("imagen usada") ||
    text.includes("imagenes usadas") ||
    text.includes("used image") ||
    text.includes("selecciona las imagenes")
  );
}

async function pageLooksLikeQuestion(page: Page) {
  const radioCount = await page.locator('input[type="radio"], [role="radio"]').count();
  return radioCount > 0;
}

async function pageLooksLikeCompletion(page: Page) {
  const text = normalizeText(await page.locator("body").innerText());
  return (
    text.includes("gracias") ||
    text.includes("confirmacion") ||
    text.includes("confirmación") ||
    text.includes("finalizado") ||
    text.includes("completado")
  );
}

async function extractQuestionText(page: Page) {
  const locators = ["h1", "h2", "h3", "legend", "[role='heading']", "p", "label"];
  for (const selector of locators) {
    const texts = await page.locator(selector).allInnerTexts();
    const candidate = texts.map((item) => item.trim()).find((item) => item.length > 20);
    if (candidate) {
      return candidate;
    }
  }

  return "Pregunta no detectada";
}

async function extractOptions(page: Page, selectors: SurveySelectorConfig) {
  const options: Array<{ text: string; locator: Locator }> = [];
  const radioInputs = page.locator('input[type="radio"]');
  const radioCount = await radioInputs.count();

  for (let index = 0; index < radioCount; index += 1) {
    const input = radioInputs.nth(index);
    const id = await input.getAttribute("id");
    let labelText = "";
    let labelLocator: Locator | null = null;

    if (id) {
      const label = page.locator(`label[for="${id}"]`).first();
      if (await label.count()) {
        labelText = (await label.innerText()).trim();
        labelLocator = label;
      }
    }

    if (!labelText) {
      const container = input.locator("xpath=ancestor::label[1]").first();
      if (await container.count()) {
        labelText = (await container.innerText()).trim();
        labelLocator = container;
      }
    }

    if (!labelText) {
      labelText = `Opción ${index + 1}`;
    }

    options.push({
      text: labelText,
      locator: labelLocator ?? input
    });
  }

  if (options.length > 0) {
    return options;
  }

  for (const selector of selectors.optionContainerSelectors) {
    const items = page.locator(selector);
    const count = await items.count();

    for (let index = 0; index < count; index += 1) {
      const locator = items.nth(index);
      const text = (await locator.innerText()).trim();
      if (text) {
        options.push({ text, locator });
      }
    }
  }

  return options;
}

async function extractImageLinks(page: Page, selectors: SurveySelectorConfig) {
  const urls = new Set<string>();

  for (const selector of selectors.imageSelectors) {
    const handles = await page.locator(selector).evaluateAll((elements) =>
      elements
        .map((element) => {
          if (element instanceof HTMLImageElement) {
            return element.currentSrc || element.src;
          }

          if (element instanceof HTMLAnchorElement) {
            return element.href;
          }

          return null;
        })
        .filter(Boolean)
    );

    for (const handle of handles) {
      if (typeof handle === "string" && handle.startsWith("http")) {
        urls.add(handle);
      }
    }
  }

  return [...urls];
}

async function captureAndUploadScreenshot({
  page,
  runId,
  fileName,
  bucket
}: {
  page: Page;
  runId: string;
  fileName: string;
  bucket: string;
}) {
  const buffer = await page.screenshot({
    fullPage: true,
    type: "png"
  });
  const storagePath = path.posix.join("runs", runId, "screenshots", fileName);

  await uploadBufferToStorage({
    bucket,
    filePath: storagePath,
    buffer,
    contentType: "image/png"
  });

  return {
    buffer,
    storagePath
  };
}

async function setCurrentBrowserScreenshot({
  runId,
  bucket,
  storagePath
}: {
  runId: string;
  bucket: string;
  storagePath: string;
}) {
  await updateSurveyRun(runId, {
    current_screenshot_bucket: bucket,
    current_screenshot_path: storagePath,
    current_screenshot_updated_at: new Date().toISOString()
  });
}

async function emitWorkerEvent({
  runId,
  eventType,
  step,
  message,
  level = "info",
  metadata = {},
  screenshotBucket,
  screenshotPath
}: {
  runId: string;
  eventType: string;
  step: string;
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  metadata?: Record<string, unknown>;
  screenshotBucket?: string;
  screenshotPath?: string;
}) {
  const timestamp = new Date().toISOString();

  await createBrowserEvent({
    surveyRunId: runId,
    level,
    eventType,
    message,
    details: {
      runId,
      step,
      timestamp,
      ...metadata
    },
    screenshotBucket,
    screenshotPath
  });
}

async function captureActionScreenshot({
  page,
  runId,
  step,
  action,
  message,
  metadata = {}
}: {
  page: Page;
  runId: string;
  step: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const safeAction = action.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const fileName = `live-${Date.now()}-${safeAction}.png`;
  const screenshot = await captureAndUploadScreenshot({
    page,
    runId,
    fileName,
    bucket: STORAGE_BUCKETS.analysisArtifacts
  });

  await setCurrentBrowserScreenshot({
    runId,
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    storagePath: screenshot.storagePath
  });

  await emitWorkerEvent({
    runId,
    eventType: "live_browser_captured",
    step,
    message,
    metadata: {
      action,
      ...metadata
    },
    screenshotBucket: STORAGE_BUCKETS.analysisArtifacts,
    screenshotPath: screenshot.storagePath
  });

  return screenshot;
}

function startLiveBrowserView({
  page,
  runId
}: {
  page: Page;
  runId: string;
}) {
  let isUploading = false;

  const interval = setInterval(async () => {
    if (isUploading) {
      return;
    }

    isUploading = true;

    try {
      const buffer = await page.screenshot({
        fullPage: true,
        type: "png"
      });
      const storagePath = path.posix.join("runs", runId, "live", "current.png");

      await uploadBufferToStorage({
        bucket: STORAGE_BUCKETS.analysisArtifacts,
        filePath: storagePath,
        buffer,
        contentType: "image/png"
      });

      await setCurrentBrowserScreenshot({
        runId,
        bucket: STORAGE_BUCKETS.analysisArtifacts,
        storagePath
      });
    } catch {
      // Ignore screenshot loop errors; explicit run failures are handled elsewhere.
    } finally {
      isUploading = false;
    }
  }, 2000);

  return () => clearInterval(interval);
}

function pickBestAnalysis(
  results: Array<{
    image: ExtractedSurveyImage;
    analysis: Awaited<ReturnType<typeof runVisualAnalysis>>;
  }>
) {
  const confidenceRank = {
    alta: 3,
    media: 2,
    baja: 1
  };

  return [...results].sort((left, right) => {
    const leftApproval = left.analysis.decision_supervisor.status === "approve" ? 1 : 0;
    const rightApproval = right.analysis.decision_supervisor.status === "approve" ? 1 : 0;

    if (leftApproval !== rightApproval) {
      return rightApproval - leftApproval;
    }

    const leftCanAnswer = left.analysis.no_puedo_responder ? 0 : 1;
    const rightCanAnswer = right.analysis.no_puedo_responder ? 0 : 1;

    if (leftCanAnswer !== rightCanAnswer) {
      return rightCanAnswer - leftCanAnswer;
    }

    return confidenceRank[right.analysis.confianza] - confidenceRank[left.analysis.confianza];
  })[0];
}

async function selectBestMatchingOption(
  page: Page,
  selectors: SurveySelectorConfig,
  answerText: string,
  answerLabel: string
) {
  const options = await extractOptions(page, selectors);

  if (options.length === 0) {
    throw new Error("No se detectaron opciones visibles para seleccionar.");
  }

  const normalizedText = normalizeText(answerText);
  const normalizedLabel = normalizeText(answerLabel);

  const directMatch =
    options.find((option) => normalizeText(option.text) === normalizedText) ??
    options.find((option) => normalizeText(option.text) === normalizedLabel) ??
    options.find(
      (option) =>
        normalizeText(option.text).includes(normalizedText) ||
        normalizeText(option.text).includes(normalizedLabel)
    );

  if (!directMatch) {
    throw new Error(`No se pudo mapear la respuesta visible: ${answerText}`);
  }

  await directMatch.locator.click();
  return directMatch.text;
}

async function extractFinalCode(page: Page, selectors: SurveySelectorConfig) {
  for (const selector of selectors.finalCodeSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = (await locator.innerText()).trim();
      if (text) {
        return text;
      }
    }
  }

  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/[A-Z0-9]{6,}/);
  return match?.[0] ?? null;
}

async function selectUsedImages(page: Page, selectors: SurveySelectorConfig, usedImages: ExtractedSurveyImage[]) {
  const checkboxes = page.locator(selectors.usedImageCheckboxSelectors.join(", "));
  const count = await checkboxes.count();

  if (count === 1) {
    await checkboxes.first().click();
    return 1;
  }

  let selected = 0;

  for (const image of usedImages) {
    const imageName = image.storagePath.split("/").pop() ?? "";
    const candidate = page.locator(`img[src*="${imageName}"]`).first();
    if (await candidate.count()) {
      const checkbox = candidate.locator("xpath=ancestor::*[self::label or self::div][1]//input[@type='checkbox']").first();
      if (await checkbox.count()) {
        await checkbox.check();
        selected += 1;
      }
    }
  }

  return selected;
}

async function persistExtractedImage(runId: string, sourceUrl: string, index: number) {
  const remote = await fetchRemoteImage(sourceUrl);
  const extension = remote.mimeType.split("/")[1] ?? "jpg";
  const storagePath = path.posix.join("runs", runId, "source-images", `image-${index + 1}.${extension}`);

  await uploadBufferToStorage({
    bucket: STORAGE_BUCKETS.surveyImages,
    filePath: storagePath,
    buffer: remote.buffer,
    contentType: remote.mimeType
  });

  const imageRecordId = await createImageRecord({
    survey_run_id: runId,
    image_role: "source",
    source_url: sourceUrl,
    storage_bucket: STORAGE_BUCKETS.surveyImages,
    storage_path: storagePath,
    metadata: {
      source_url: sourceUrl
    }
  });

  return {
    sourceUrl,
    imageRecordId,
    storagePath,
    signedUrl: await createSignedStorageUrl(STORAGE_BUCKETS.surveyImages, storagePath)
  };
}

export async function runPilotSurvey(runId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: run, error } = await supabase
    .from("survey_runs")
    .select("*, stores(store_code)")
    .eq("id", runId)
    .single();

  if (error) {
    throw error;
  }

  const browserConfig = mergePilotBrowserConfig((run.browser_config as Record<string, unknown>) ?? {});
  const surveyUrl = run.survey_url;
  const validatorCode = run.validator_code ?? "";

  if (!surveyUrl) {
    throw new Error("survey_url no configurado en survey_runs.");
  }

  await emitWorkerEvent({
    runId,
    eventType: "browser_launching",
    step: "browser_launch",
    message: "Iniciando browser Playwright.",
    metadata: {
      headless: browserConfig.headless
    }
  });

  const browser = await chromium.launch({
    headless: browserConfig.headless
  });
  await emitWorkerEvent({
    runId,
    eventType: "browser_launched",
    step: "browser_launch",
    message: "Browser Playwright lanzado.",
    metadata: {
      headless: browserConfig.headless
    }
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const browserSessionId = randomUUID();
  let stopLiveBrowserView: (() => void) | null = null;

  try {
    await updateSurveyRun(runId, {
      status: "running",
      current_step: "opening_survey",
      browser_session_id: browserSessionId,
      started_at: new Date().toISOString()
    });

    await emitWorkerEvent({
      runId,
      eventType: "worker_started",
      step: "worker_boot",
      message: "Worker Playwright iniciado.",
      metadata: {
        surveyUrl: run.survey_url
      }
    });

    stopLiveBrowserView = startLiveBrowserView({
      page,
      runId
    });

    await emitWorkerEvent({
      runId,
      eventType: "opening_survey",
      step: "opening_survey",
      message: "Abriendo URL de encuesta.",
      metadata: {
        surveyUrl
      }
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "before-open-survey",
      message: "Vista inicial antes de abrir la encuesta."
    });

    await page.goto(surveyUrl, {
      waitUntil: "networkidle"
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "after-open-survey",
      message: "Encuesta abierta en navegador."
    });
    await emitWorkerEvent({
      runId,
      eventType: "survey_opened",
      step: "opening_survey",
      message: "Encuesta abierta en navegador.",
      metadata: {
        surveyUrl
      }
    });

    const storeCode =
      run.stores && typeof run.stores === "object" && "store_code" in run.stores
        ? String(run.stores.store_code ?? "")
        : "";

    await emitWorkerEvent({
      runId,
      eventType: "filling_store_code",
      step: "opening_survey",
      message: "Completando store code.",
      metadata: {
        storeCode
      }
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "before-fill-store-code",
      message: "Antes de llenar store code.",
      metadata: {
        storeCode
      }
    });
    await fillFirstAvailable(page, browserConfig.selectors.storeCodeInputSelectors, storeCode);
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "after-fill-store-code",
      message: "Store code visible en el formulario.",
      metadata: {
        storeCode
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "store_code_filled",
      step: "opening_survey",
      message: "Store code cargado en el formulario.",
      metadata: {
        storeCode
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "filling_validator_code",
      step: "opening_survey",
      message: "Completando validator code.",
      metadata: {
        validatorCodeLength: validatorCode.length
      }
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "before-fill-validator-code",
      message: "Antes de llenar validator code."
    });
    await fillFirstAvailable(page, browserConfig.selectors.validatorCodeInputSelectors, validatorCode);
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "after-fill-validator-code",
      message: "Validator code visible en el formulario."
    });
    await emitWorkerEvent({
      runId,
      eventType: "validator_code_filled",
      step: "opening_survey",
      message: "Validator code cargado en el formulario.",
      metadata: {
        validatorCodeLength: validatorCode.length
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "clicking_next",
      step: "opening_survey",
      message: "Ejecutando click en siguiente.",
      metadata: {
        context: "open_survey"
      }
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "before-click-next-open-survey",
      message: "Antes de hacer clic en siguiente para abrir la encuesta."
    });
    await clickNext(page, browserConfig.selectors.nextButtonSelectors);
    await captureActionScreenshot({
      page,
      runId,
      step: "opening_survey",
      action: "after-click-next-open-survey",
      message: "Pantalla posterior al clic en siguiente."
    });
    await emitWorkerEvent({
      runId,
      eventType: "next_clicked",
      step: "opening_survey",
      message: "Click en siguiente para abrir la encuesta.",
      metadata: {
        context: "open_survey"
      }
    });

    await updateSurveyRun(runId, {
      status: "extracting_images",
      current_step: "extracting_images",
      current_question_text: null
    });

    await page.waitForLoadState("networkidle");

    const imageLinks = await extractImageLinks(page, browserConfig.selectors);
    await captureActionScreenshot({
      page,
      runId,
      step: "extracting_images",
      action: "image-links-visible",
      message: "Captura cuando aparecen los links de imágenes.",
      metadata: {
        imageLinkCount: imageLinks.length
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "image_links_detected",
      step: "extracting_images",
      message: "Links de imágenes detectados.",
      metadata: {
        count: imageLinks.length,
        urls: imageLinks
      }
    });

    const extractedImages: ExtractedSurveyImage[] = [];

    for (const [index, sourceUrl] of imageLinks.entries()) {
      try {
        await emitWorkerEvent({
          runId,
          eventType: "image_download_started",
          step: "extracting_images",
          message: `Descarga iniciada para imagen ${index + 1}.`,
          metadata: {
            imageIndex: index + 1,
            sourceUrl
          }
        });

        const extracted = await persistExtractedImage(runId, sourceUrl, index);
        extractedImages.push(extracted);
        await emitWorkerEvent({
          runId,
          eventType: "image_download_completed",
          step: "extracting_images",
          message: `Descarga completada para imagen ${index + 1}.`,
          metadata: {
            imageIndex: index + 1,
            sourceUrl,
            imageRecordId: extracted.imageRecordId,
            storagePath: extracted.storagePath
          }
        });
      } catch (imageError) {
        await emitWorkerEvent({
          runId,
          level: "warn",
          eventType: "image_extract_failed",
          step: "extracting_images",
          message: imageError instanceof Error ? imageError.message : "Error descargando imagen.",
          metadata: {
            sourceUrl
          }
        });
      }
    }

    await emitWorkerEvent({
      runId,
      eventType: "images_uploaded",
      step: "extracting_images",
      message: "Imágenes persistidas en storage.",
      metadata: {
        count: extractedImages.length,
        imageRecordIds: extractedImages.map((image) => image.imageRecordId)
      }
    });

    await emitWorkerEvent({
      runId,
      eventType: "clicking_next",
      step: "extracting_images",
      message: "Ejecutando click en siguiente tras extraer imágenes.",
      metadata: {
        context: "after_image_extraction"
      }
    });
    await captureActionScreenshot({
      page,
      runId,
      step: "extracting_images",
      action: "before-click-next-after-images",
      message: "Antes de avanzar después de detectar imágenes."
    });
    await clickNext(page, browserConfig.selectors.nextButtonSelectors);
    await captureActionScreenshot({
      page,
      runId,
      step: "extracting_images",
      action: "after-click-next-after-images",
      message: "Pantalla posterior a la extracción de imágenes."
    });
    await emitWorkerEvent({
      runId,
      eventType: "next_clicked",
      step: "extracting_images",
      message: "Click en siguiente después de extraer imágenes.",
      metadata: {
        context: "after_image_extraction"
      }
    });

    await updateSurveyRun(runId, {
      status: "answering_questions",
      current_step: "question_loop"
    });
    await emitWorkerEvent({
      runId,
      eventType: "pre_analysis_started",
      step: "pre_analysis",
      message: "Preparación del análisis visual iniciada.",
      metadata: {
        extractedImageCount: extractedImages.length
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "pre_analysis_completed",
      step: "pre_analysis",
      message: "Preparación del análisis visual completada.",
      metadata: {
        extractedImageCount: extractedImages.length
      }
    });

    let questionIndex = 0;
    const usedImageMap = new Map<string, ExtractedSurveyImage>();

    while (questionIndex < 100) {
      await page.waitForLoadState("networkidle");

      if (await pageLooksLikeUsedImages(page)) {
        break;
      }

      if (await pageLooksLikeCompletion(page)) {
        break;
      }

      if (!(await pageLooksLikeQuestion(page))) {
        await emitWorkerEvent({
          runId,
          level: "warn",
          eventType: "question_not_detected",
          step: "question_loop",
          message: "No se detectó una pantalla de pregunta; se intenta continuar.",
          metadata: {
            questionIndex
          }
        });
        break;
      }

      const screenshot = await captureAndUploadScreenshot({
        page,
        runId,
        fileName: `question-${questionIndex + 1}.png`,
        bucket: STORAGE_BUCKETS.questionScreenshots
      });
      await setCurrentBrowserScreenshot({
        runId,
        bucket: STORAGE_BUCKETS.questionScreenshots,
        storagePath: screenshot.storagePath
      });
      await emitWorkerEvent({
        runId,
        eventType: "question_screenshot_saved",
        step: `question_${questionIndex + 1}`,
        message: `Screenshot guardado para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          fileName: `question-${questionIndex + 1}.png`
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "question-visible",
        message: `Pregunta ${questionIndex + 1} visible en el navegador.`,
        metadata: {
          questionIndex
        }
      });

      const questionText = await extractQuestionText(page);
      const options = await extractOptions(page, browserConfig.selectors);

      await updateSurveyRun(runId, {
        current_question_index: questionIndex,
        current_step: `answering_question_${questionIndex}`,
        current_question_text: questionText
      });
      await emitWorkerEvent({
        runId,
        eventType: "question_detected",
        step: `question_${questionIndex + 1}`,
        message: `Pregunta ${questionIndex + 1} detectada.`,
        metadata: {
          questionIndex,
          questionText,
          optionCount: options.length,
          options: options.map((option) => option.text)
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      const questionId = await createQuestionRecord({
        survey_run_id: runId,
        question_index: questionIndex,
        screenshot_bucket: STORAGE_BUCKETS.questionScreenshots,
        screenshot_path: screenshot.storagePath,
        detected_question: questionText,
        options: options.map((option, index) => ({
          label: `option_${index + 1}`,
          text: option.text
        })),
        question_type: "unknown",
        status: "analyzed"
      });

      const analyses = [];
      await emitWorkerEvent({
        runId,
        eventType: "visual_analysis_started",
        step: `question_${questionIndex + 1}`,
        message: `Análisis visual iniciado para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          candidateImageCount: extractedImages.length
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      for (const image of extractedImages) {
        const analysis = await runVisualAnalysis({
          mainImageUrl: image.signedUrl,
          questionnaireImage: screenshot.buffer,
          questionnaireImageMimeType: "image/png",
          questionnaireFilename: `question-${questionIndex + 1}.png`,
          manualQuestion: questionText
        });

        analyses.push({
          image,
          analysis
        });
      }

      if (analyses.length === 0) {
        throw new Error("No hay imágenes disponibles para analizar la pregunta actual.");
      }

      await emitWorkerEvent({
        runId,
        eventType: "visual_analysis_completed",
        step: `question_${questionIndex + 1}`,
        message: `Análisis visual completado para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          candidateCount: analyses.length
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      await emitWorkerEvent({
        runId,
        eventType: "supervisor_started",
        step: `question_${questionIndex + 1}`,
        message: `Revisión de supervisor iniciada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          candidateCount: analyses.length
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      const best = pickBestAnalysis(analyses);
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "before-select-option",
        message: `Antes de seleccionar respuesta para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          predictedLabel: best.analysis.respuesta_final_label
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "supervisor_completed",
        step: `question_${questionIndex + 1}`,
        message: `Revisión de supervisor completada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          supervisorStatus: best.analysis.decision_supervisor.status,
          hallucinationRisk: best.analysis.decision_supervisor.hallucination_risk,
          selectedImageRecordId: best.image.imageRecordId
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      const selectedText = await selectBestMatchingOption(
        page,
        browserConfig.selectors,
        best.analysis.respuesta_final_texto,
        best.analysis.respuesta_final_label
      );
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "after-select-option",
        message: `Respuesta seleccionada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          selectedText
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "option_selected",
        step: `question_${questionIndex + 1}`,
        message: `Opción seleccionada para pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          questionId,
          selectedText,
          selectedLabel: best.analysis.respuesta_final_label
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      usedImageMap.set(best.image.imageRecordId, best.image);

      await upsertAnswerRecord(questionId, {
        selected_option_label: best.analysis.respuesta_final_label,
        selected_option_text: selectedText,
        internal_response: best.analysis.respuesta,
        confidence: best.analysis.confianza,
        explanation: best.analysis.explicacion,
        reasoning: {
          pregunta_detectada: best.analysis.pregunta_detectada,
          evidencia_visual: best.analysis.evidencia_visual,
          razon_de_mapeo: best.analysis.razon_de_mapeo
        },
        evidence_image_id: best.image.imageRecordId,
        evidence_crop_path: best.analysis.evidencia_trazable.crop_asset,
        evidence_coordinates: best.analysis.evidencia_trazable.coordinates,
        evidence_section: best.analysis.evidencia_trazable.section,
        ocr_evidence: best.analysis.evidencia_trazable.ocr_evidence,
        no_puedo_responder: best.analysis.no_puedo_responder,
        no_puedo_responder_reason: best.analysis.motivo_no_puedo_responder,
        supervisor_status: best.analysis.decision_supervisor.status,
        supervisor_rationale: best.analysis.decision_supervisor.rationale,
        hallucination_risk: best.analysis.decision_supervisor.hallucination_risk,
        final_payload: best.analysis
      });

      await uploadJsonArtifact({
        runId,
        name: `question-${questionIndex + 1}-analysis`,
        payload: analyses.map((item) => ({
          imageRecordId: item.image.imageRecordId,
          sourceUrl: item.image.sourceUrl,
          result: item.analysis
        }))
      });

      await emitWorkerEvent({
        runId,
        eventType: "question_completed",
        step: `question_${questionIndex + 1}`,
        message: `Pregunta ${questionIndex + 1} completada.`,
        metadata: {
          questionText,
          questionIndex,
          questionId,
          selectedText,
          evidenceImageId: best.image.imageRecordId,
          confidence: best.analysis.confianza,
          supervisorStatus: best.analysis.decision_supervisor.status
        },
        screenshotBucket: STORAGE_BUCKETS.questionScreenshots,
        screenshotPath: screenshot.storagePath
      });

      await updateSurveyRun(runId, {
        last_reasoning_summary: best.analysis.explicacion,
        last_selected_option_text: selectedText,
        last_supervisor_decision: best.analysis.decision_supervisor.status
      });

      await emitWorkerEvent({
        runId,
        eventType: "clicking_next",
        step: `question_${questionIndex + 1}`,
        message: `Ejecutando click en siguiente después de pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          context: "after_question_answer"
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "before-click-next-after-question",
        message: `Antes de avanzar tras responder pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex
        }
      });
      await clickNext(page, browserConfig.selectors.nextButtonSelectors);
      await captureActionScreenshot({
        page,
        runId,
        step: `question_${questionIndex + 1}`,
        action: "after-click-next-after-question",
        message: `Pantalla posterior a la pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex
        }
      });
      await emitWorkerEvent({
        runId,
        eventType: "next_clicked",
        step: `question_${questionIndex + 1}`,
        message: `Click en siguiente después de pregunta ${questionIndex + 1}.`,
        metadata: {
          questionIndex,
          context: "after_question_answer"
        }
      });
      questionIndex += 1;
    }

    await updateSurveyRun(runId, {
      status: "selecting_used_images",
      current_step: "selecting_used_images"
    });

    if (await pageLooksLikeUsedImages(page)) {
      await emitWorkerEvent({
        runId,
        eventType: "used_images_selection_started",
        step: "selecting_used_images",
        message: "Selección de imágenes usadas iniciada.",
        metadata: {
          candidateCount: usedImageMap.size
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "used-images-screen",
        message: "Pantalla de selección de imágenes usadas."
      });

      const selectedCount = await selectUsedImages(
        page,
        browserConfig.selectors,
        [...usedImageMap.values()]
      );

      await emitWorkerEvent({
        runId,
        eventType: "used_images_selected",
        step: "selecting_used_images",
        message: "Selección de imágenes usadas completada.",
        metadata: {
          selectedCount
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "used-images-selected",
        message: "Selección de imágenes usadas aplicada.",
        metadata: {
          selectedCount
        }
      });

      await emitWorkerEvent({
        runId,
        eventType: "clicking_next",
        step: "selecting_used_images",
        message: "Ejecutando click en siguiente tras seleccionar imágenes usadas.",
        metadata: {
          context: "after_used_images_selection"
        }
      });
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "before-click-next-used-images",
        message: "Antes de avanzar después de seleccionar imágenes usadas."
      });
      await clickNext(page, browserConfig.selectors.nextButtonSelectors);
      await captureActionScreenshot({
        page,
        runId,
        step: "selecting_used_images",
        action: "after-click-next-used-images",
        message: "Pantalla posterior a la selección de imágenes usadas."
      });
      await emitWorkerEvent({
        runId,
        eventType: "next_clicked",
        step: "selecting_used_images",
        message: "Click en siguiente después de seleccionar imágenes usadas.",
        metadata: {
          context: "after_used_images_selection"
        }
      });
    }

    await page.waitForLoadState("networkidle");

    const finalCode = await extractFinalCode(page, browserConfig.selectors);
    await captureActionScreenshot({
      page,
      runId,
      step: "completion",
      action: "final-screen",
      message: "Pantalla final del navegador.",
      metadata: {
        finalCode
      }
    });
    await emitWorkerEvent({
      runId,
      eventType: "final_code_detected",
      step: "completion",
      message: "Código final detectado.",
      metadata: {
        finalCode
      }
    });

    await updateSurveyRun(runId, {
      status: "completed",
      current_step: "completed",
      current_question_text: null,
      final_code: finalCode,
      completed_at: new Date().toISOString()
    });

    await emitWorkerEvent({
      runId,
      eventType: "run_completed",
      step: "completion",
      message: "Encuesta completada.",
      metadata: {
        finalCode
      }
    });
  } catch (error) {
    const screenshot = await captureAndUploadScreenshot({
      page,
      runId,
      fileName: `error-${Date.now()}.png`,
      bucket: STORAGE_BUCKETS.errorScreenshots
    }).catch(() => null);

    await updateSurveyRun(runId, {
      status: "failed",
      current_step: "failed",
      last_error: error instanceof Error ? error.message : "Error desconocido en worker.",
      error_screenshot_bucket: screenshot ? STORAGE_BUCKETS.errorScreenshots : null,
      error_screenshot_path: screenshot?.storagePath ?? null
    });

    await emitWorkerEvent({
      runId,
      level: "error",
      eventType: "run_failed",
      step: "failed",
      message: error instanceof Error ? error.message : "Error desconocido en worker.",
      metadata: {
        currentStep: "failed"
      },
      screenshotBucket: screenshot ? STORAGE_BUCKETS.errorScreenshots : undefined,
      screenshotPath: screenshot?.storagePath
    });

    throw error;
  } finally {
    stopLiveBrowserView?.();
    await browser.close();
    await getSurveyRunDetails(runId).catch(() => null);
  }
}
