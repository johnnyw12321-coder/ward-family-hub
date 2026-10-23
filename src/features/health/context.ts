import "server-only";
import { redirect } from "next/navigation";
import { getActionContext, requireHousehold, type HouseholdContext } from "@/lib/auth/context";
import type { HealthRepository } from "./repository";
import { HealthStoreError } from "./errors";
import { SupabaseHealthRepository } from "./supabase-repository";
import type { HealthProfile } from "./types";

export type HealthContext = { ctx: HouseholdContext; repo: HealthRepository };

/** The one place that chooses Ward Health's storage. */
export function healthRepository(ctx: HouseholdContext): HealthRepository {
  return new SupabaseHealthRepository(ctx);
}

/** For pages that work with or without a profile (onboarding, settings). */
export async function requireHealthContext(): Promise<HealthContext & { profile: HealthProfile | null }> {
  const ctx = await requireHousehold();
  const repo = healthRepository(ctx);
  return { ctx, repo, profile: await repo.getProfile() };
}

/** For pages that need a profile: people who haven't set one up go to onboarding first. */
export async function requireHealthProfile(): Promise<HealthContext & { profile: HealthProfile }> {
  const h = await requireHealthContext();
  if (!h.profile) redirect("/health/welcome");
  return { ...h, profile: h.profile };
}

/**
 * For Server Actions. Ward Health data is personal, so read-only household
 * members can still keep their own (RLS limits every row to its owner).
 */
export async function getHealthActionContext(): Promise<({ ok: true } & HealthContext) | { ok: false; error: string }> {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return auth;
  return { ok: true, ctx: auth.ctx, repo: healthRepository(auth.ctx) };
}

export function storeErrorMessage(error: unknown): string {
  return error instanceof HealthStoreError ? error.message : "Something went wrong. Please try again.";
}
