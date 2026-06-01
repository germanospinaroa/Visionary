import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAuditRun } from "@/lib/new-audit-runtime";

export const runtime = "nodejs";

function isAllowedArtifactPath(targetPath: string) {
  const normalized = path.resolve(targetPath);
  const allowedRoot = path.resolve(process.cwd(), "output", "playwright", "minimal-runs");
  return normalized.startsWith(allowedRoot);
}

function toArtifactUrl(filePath: string) {
  return `/api/new-audit/artifact?path=${encodeURIComponent(filePath)}`;
}

function toWorkerArtifactUrl(baseUrl: string, filePath: string) {
  return `${baseUrl}/minimal-runs/artifact?path=${encodeURIComponent(filePath)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = getAuditRun(runId);

  if (!run) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    run: {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      currentStep: run.currentStep,
      title: run.title,
      finalUrl: run.finalUrl,
      detectedFirstQuestion: run.detectedFirstQuestion,
      probableQuestionText: run.probableQuestionText,
      pageTextPreview: run.pageTextPreview,
      radioCount: run.radioCount,
      finalBodyTextLength: run.finalBodyTextLength,
      pollingIterations: run.pollingIterations,
      firstQuestionDetectedAtSecond: run.firstQuestionDetectedAtSecond,
      workerEndpoint: run.workerEndpoint,
      workerStatusCode: run.workerStatusCode,
      workerErrorBody: run.workerErrorBody,
      currentScreenshotUrl:
        run.currentScreenshotPath
          ? run.workerBaseUrl
            ? toWorkerArtifactUrl(run.workerBaseUrl, run.currentScreenshotPath)
            : isAllowedArtifactPath(run.currentScreenshotPath) && fs.existsSync(run.currentScreenshotPath)
              ? toArtifactUrl(run.currentScreenshotPath)
              : null
          : null,
      timeline: run.timeline.map((item) => ({
        ...item,
        screenshotUrl:
          item.screenshotPath
            ? run.workerBaseUrl
              ? toWorkerArtifactUrl(run.workerBaseUrl, item.screenshotPath)
              : isAllowedArtifactPath(item.screenshotPath) && fs.existsSync(item.screenshotPath)
                ? toArtifactUrl(item.screenshotPath)
                : null
            : null
      })),
      screenshots: run.screenshots.map((item) => ({
        ...item,
        url: run.workerBaseUrl
          ? toWorkerArtifactUrl(run.workerBaseUrl, item.path)
          : isAllowedArtifactPath(item.path) && fs.existsSync(item.path)
            ? toArtifactUrl(item.path)
            : null
      })),
      imageLinks: run.imageLinks,
      projectQuestions: run.projectQuestions.map(({ referenceImageDataUrl, ...question }) => question),
      generalInstructions: run.input.generalInstructions,
      storeCode: run.input.storeCode,
      surveyUrl: run.input.surveyUrl,
      validatorCode: run.input.validatorCode,
      error: run.error,
      stack: run.stack
    }
  });
}
