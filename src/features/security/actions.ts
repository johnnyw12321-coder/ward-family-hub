"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, logServerError, ok, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";

/**
 * Two-factor authentication (TOTP authenticator apps) via Supabase Auth MFA.
 * Completing a challenge upgrades the session to AAL2, which the database
 * requires for sensitive documents. Verification cookies are written by the
 * server client inside these actions.
 */

const code = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

export async function startTotpEnrollment(): Promise<ActionResult<{ factorId: string; qrCode: string; secret: string }>> {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const mfa = ctx.supabase.auth.mfa;

  // Clear abandoned, never-verified enrolments first (best effort).
  const { data: factors } = await mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") await mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: `Ward Hub ${new Date().toISOString().slice(0, 16)}` });
  if (error || !data) {
    logServerError("mfa.enroll", error);
    return fail("Two-factor setup couldn't start. Make sure MFA is enabled for the Supabase project, then try again.");
  }
  return ok({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
}

export async function confirmTotpEnrollment(factorId: string, value: string): Promise<ActionResult> {
  const parsedCode = code.safeParse(value);
  if (!z.uuid().safeParse(factorId).success || !parsedCode.success) return fail("Enter the 6-digit code from your authenticator app.");
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { error } = await auth.ctx.supabase.auth.mfa.challengeAndVerify({ factorId, code: parsedCode.data });
  if (error) return fail("That code didn't match. Check the time on your phone and try the newest code.");
  refresh();
  return ok(null, "Two-factor authentication is on");
}

/** Step-up: verify with the first enrolled authenticator to reach AAL2. */
export async function verifyTotp(value: string): Promise<ActionResult> {
  const parsedCode = code.safeParse(value);
  if (!parsedCode.success) return fail(parsedCode.error.issues[0].message);
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const mfa = auth.ctx.supabase.auth.mfa;
  const { data: factors, error: listError } = await mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (listError || !factor) return fail("Set up two-factor authentication in Settings first.");
  const { error } = await mfa.challengeAndVerify({ factorId: factor.id, code: parsedCode.data });
  if (error) return fail(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That code didn't match. Try the newest code.");
  refresh();
  return ok(null, "Verified");
}

export async function removeTotpFactor(factorId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(factorId).success) return fail("Invalid factor.");
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  if (auth.ctx.aal !== "aal2") return fail("Verify with your current code before turning two-factor off.");
  const { error } = await auth.ctx.supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    logServerError("mfa.unenroll", error);
    return fail("Couldn't remove the authenticator. Please try again.");
  }
  refresh();
  return ok(null, "Two-factor authentication removed");
}
