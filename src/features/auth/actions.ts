"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logServerError } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "./safe-redirect";

export type AuthFormState = { error?: string; message?: string; fieldErrors?: Record<string, string> } | null;

const signInSchema = z.object({
  email: z.email("Enter your email address").max(254),
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().optional(),
});

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    // Do not reveal whether the account exists.
    if (error.status === 429) return { error: "Too many attempts. Please wait a few minutes and try again." };
    return { error: "That email and password combination didn't work." };
  }
  redirect(safeNextPath(parsed.data.next));
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/update-password`,
  });
  if (error && error.status !== 429) logServerError("resetPassword", error);
  if (error?.status === 429) return { error: "Too many requests. Please wait a few minutes and try again." };
  // Same response whether or not the address has an account.
  return { message: "If that address belongs to a household member, a reset link is on its way." };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(200)
      .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Include letters and at least one number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "Your link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logServerError("updatePassword", error);
    return { error: error.code === "same_password" ? "Choose a password you haven't used before." : "Could not update your password. Please try again." };
  }
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
