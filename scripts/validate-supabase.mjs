import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const anon = createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const tempId = randomUUID().slice(0, 8);
const tempEmail = `pilot-${tempId}@example.com`;
const tempPassword = `Pilot-${tempId}-Secure!`;
const tempStoreCode = `STORE-${tempId}`;
const tempFilePath = `validation/${tempId}.txt`;

let tempUserId = null;
let tempStoreId = null;

async function validateBuckets() {
  const { data, error } = await admin.storage.listBuckets();

  if (error) {
    throw error;
  }

  const ids = data.map((bucket) => bucket.id).sort();
  console.log("Buckets:", ids.join(", "));
}

async function validateAnonBlocked() {
  const { error } = await anon.from("stores").select("id").limit(1);

  if (!error) {
    throw new Error("Anon access should be blocked for public.stores, but no error was returned.");
  }

  console.log(`Anon blocked as expected: ${error.message}`);
}

async function createAndLoginTempUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true
  });

  if (error) {
    throw error;
  }

  tempUserId = data.user.id;

  const authenticated = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { error: signInError } = await authenticated.auth.signInWithPassword({
    email: tempEmail,
    password: tempPassword
  });

  if (signInError) {
    throw signInError;
  }

  console.log(`Authenticated temp user: ${tempEmail}`);
  return authenticated;
}

async function validateAuthenticatedDatabaseAccess(authenticated) {
  const { data: inserted, error: insertError } = await authenticated
    .from("stores")
    .insert({
      store_code: tempStoreCode,
      metadata: { source: "validation-script" }
    })
    .select("id, store_code, status")
    .single();

  if (insertError) {
    throw insertError;
  }

  tempStoreId = inserted.id;
  console.log(`Authenticated insert ok: ${inserted.store_code} (${inserted.status})`);

  const { data: selected, error: selectError } = await authenticated
    .from("stores")
    .select("id, store_code")
    .eq("id", tempStoreId)
    .single();

  if (selectError) {
    throw selectError;
  }

  console.log(`Authenticated select ok: ${selected.store_code}`);
}

async function validateStoragePolicies(authenticated) {
  const uploadBody = new Blob([`validation ${tempId}`], { type: "text/plain" });
  const bucket = "analysis-artifacts";

  const { error: uploadError } = await authenticated.storage
    .from(bucket)
    .upload(tempFilePath, uploadBody, {
      contentType: "text/plain",
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  console.log(`Storage upload ok: ${bucket}/${tempFilePath}`);

  const { data: listed, error: listError } = await authenticated.storage
    .from(bucket)
    .list("validation", {
      search: `${tempId}.txt`
    });

  if (listError) {
    throw listError;
  }

  if (!listed.some((item) => item.name === `${tempId}.txt`)) {
    throw new Error("Uploaded storage object was not found during list validation.");
  }

  console.log("Storage list ok");

  const { error: removeError } = await authenticated.storage.from(bucket).remove([tempFilePath]);

  if (removeError) {
    throw removeError;
  }

  console.log("Storage delete ok");
}

async function cleanup() {
  if (tempStoreId) {
    await admin.from("stores").delete().eq("id", tempStoreId);
  }

  if (tempUserId) {
    await admin.auth.admin.deleteUser(tempUserId);
  }
}

try {
  await validateBuckets();
  await validateAnonBlocked();
  const authenticated = await createAndLoginTempUser();
  await validateAuthenticatedDatabaseAccess(authenticated);
  await validateStoragePolicies(authenticated);
  console.log("Supabase validation complete.");
} finally {
  await cleanup();
}
