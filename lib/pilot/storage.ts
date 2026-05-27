import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";

export async function uploadBufferToStorage({
  bucket,
  filePath,
  buffer,
  contentType
}: {
  bucket: string;
  filePath: string;
  buffer: Buffer;
  contentType: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType,
    upsert: true
  });

  if (error) {
    throw error;
  }

  return filePath;
}

export async function uploadJsonArtifact({
  runId,
  name,
  payload
}: {
  runId: string;
  name: string;
  payload: unknown;
}) {
  const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const filePath = path.posix.join("runs", runId, "artifacts", `${name}.json`);

  await uploadBufferToStorage({
    bucket: STORAGE_BUCKETS.analysisArtifacts,
    filePath,
    buffer,
    contentType: "application/json"
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
