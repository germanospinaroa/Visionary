import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envPath);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const buckets = [
  {
    id: "survey-images",
    options: {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
    }
  },
  {
    id: "question-screenshots",
    options: {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
    }
  },
  {
    id: "analysis-artifacts",
    options: {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ["application/json", "image/jpeg", "image/png", "image/webp", "text/plain"]
    }
  },
  {
    id: "error-screenshots",
    options: {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
    }
  }
];

const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

if (listError) {
  throw listError;
}

for (const bucket of buckets) {
  const existing = existingBuckets.find((item) => item.id === bucket.id);

  if (!existing) {
    const { error } = await supabase.storage.createBucket(bucket.id, bucket.options);

    if (error) {
      throw error;
    }

    console.log(`Created bucket: ${bucket.id}`);
    continue;
  }

  const { error } = await supabase.storage.updateBucket(bucket.id, bucket.options);

  if (error) {
    throw error;
  }

  console.log(`Updated bucket: ${bucket.id}`);
}

console.log("Storage provisioning complete.");
