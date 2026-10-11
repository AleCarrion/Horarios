import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The public (anon / publishable) key. Some hosts refuse variable names that contain "KEY", so a name without it works too.
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON;

/** Returns null when env vars are missing: the app then runs in local-only mode. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = url && key ? createClient(url, key) : null;
  return client;
}

export const remoteConfigured = Boolean(url && key);
