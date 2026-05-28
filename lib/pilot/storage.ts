import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";

type StorageTraceContext = {
  runId?: string;
  currentStep?: string;
  sourceUrl?: string;
  contentType?: string;
  functionName?: string;
  artifactType?: string;
  fileName?: string;
};

function logStorageTrace(
  level: "info" | "error",
  functionName: string,
  message: string,
  context: StorageTraceContext = {},
  error?: unknown
) {
  const payload = {
    scope: "lib/pilot/storage",
    level,
    functionName,
    message,
    runId: context.runId ?? null,
    currentStep: context.currentStep ?? null,
    sourceUrl: context.sourceUrl ?? null,
    contentType: context.contentType ?? null,
    artifactType: context.artifactType ?? null,
    fileName: context.fileName ?? null,
    errorMessage: error instanceof Error ? error.message : null,
    errorStack: error instanceof Error ? error.stack ?? null : null,
    timestamp: new Date().toISOString()
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export async function uploadBufferToStorage({
  bucket,
  filePath,
  buffer,
  contentType,
  traceContext
}: {
  bucket: string;
  filePath: string;
  buffer: Buffer;
  contentType: string;
  traceContext?: StorageTraceContext;
}) {
  logStorageTrace("info", "uploadBufferToStorage", "uploadBufferToStorage:start", {
    ...traceContext,
    contentType
  });

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
      contentType,
      upsert: true
    });

    if (error) {
      throw error;
    }

    return filePath;
  } catch (error) {
    logStorageTrace(
      "error",
      "uploadBufferToStorage",
      "uploadBufferToStorage:error",
      {
        ...traceContext,
        contentType
      },
      error
    );
    throw error;
  }
}

export async function uploadJsonArtifact({
  runId,
  name,
  payload,
  traceContext
}: {
  runId: string;
  name: string;
  payload: unknown;
  traceContext?: StorageTraceContext;
}) {
  const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const filePath = path.posix.join("runs", runId, "artifacts", `${name}.json`);
  const nextTraceContext = {
    ...traceContext,
    runId,
    functionName: "uploadJsonArtifact",
    artifactType: "json_artifact",
    fileName: filePath,
    contentType: "application/json"
  };

  logStorageTrace("info", "uploadJsonArtifact", "uploadBufferToStorage:caller", nextTraceContext);

  await uploadBufferToStorage({
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    filePath,
    buffer,
    contentType: "application/json",
    traceContext: nextTraceContext
  });

  return {
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    path: filePath
  };
}

export async function createSignedStorageUrl(bucket: string, filePath: string, expiresIn = 3600) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
