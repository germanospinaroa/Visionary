import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl
} from "@/lib/supabase/env";

let cachedAdminClient: ReturnType<typeof createClient<Database>> | null = null;
let cachedServerClient: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseAdminClient() {
  if (!cachedAdminClient) {
    cachedAdminClient = createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return cachedAdminClient;
}

export function createSupabaseServerServiceClient() {
  if (!cachedServerClient) {
    cachedServerClient = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return cachedServerClient;
}
