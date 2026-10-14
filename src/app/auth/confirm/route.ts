import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/features/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery", "email", "email_change", "magiclink"];

/**
 * Handles links from Supabase emails (invites and password resets).
 * Supports the token_hash template (recommended for SSR) and the PKCE code flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/");
  const supabase = await createClient();

  let ok = false;
  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }
  const destination = type === "invite" || type === "recovery" ? "/update-password" : next;
  return NextResponse.redirect(new URL(destination, origin));
}
