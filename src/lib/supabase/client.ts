"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/env";

/** Browser client — used only for auth flows that must run client-side (MFA enrolment). */
export function createBrowserSupabase() {
  const { url, key } = requireSupabaseConfig();
  return createBrowserClient(url, key);
}
