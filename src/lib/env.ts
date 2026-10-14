/**
 * Public Supabase configuration. Only the project URL and the publishable
 * (anon) key are ever exposed to the browser; both are safe to publish because
 * Row Level Security protects all data. The service-role key is never read by
 * the web app — it is only used by local CLI scripts (scripts/*.ts).
 */
/**
 * The project URL, reduced to its origin. People often paste the REST endpoint
 * (".../rest/v1/") or a trailing slash from the dashboard; the client adds
 * those paths itself, so anything after the host would break every request.
 */
export function normaliseSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return undefined;
  }
}

export function supabaseUrl(): string | undefined {
  return normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function requireSupabaseConfig(): { url: string; key: string } {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see README).",
    );
  }
  return { url, key };
}
