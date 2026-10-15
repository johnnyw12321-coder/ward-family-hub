import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import type { PlanLine } from "./calc";

export type SpendingPlan = {
  id: string;
  name: string;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type SpendingPlanWithLines = SpendingPlan & { lines: PlanLine[] };

class QueryError extends Error {
  constructor(scope: string, cause: { message?: string; code?: string }) {
    super(`Could not load ${scope}`);
    this.name = "QueryError";
    console.error(`[query:${scope}]`, { code: cause.code, message: cause.message });
  }
}

function toMinor(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n)) throw new RangeError("Unsafe money value from database");
  return n;
}

const LINE_COLUMNS = "id, kind, label, amount_minor, frequency, sort_order";

function normaliseLine(r: Record<string, unknown>): PlanLine {
  return { ...(r as PlanLine), amount_minor: toMinor(r.amount_minor) };
}

/** Every plan with its lines (plans are small), most recently changed first. */
export async function getPlans(ctx: HouseholdContext): Promise<SpendingPlanWithLines[]> {
  const { data, error } = await ctx.supabase
    .from("spending_plans")
    .select(`id, name, notes, updated_at, updated_by, spending_plan_lines (${LINE_COLUMNS})`)
    .eq("household_id", ctx.household.id)
    .order("updated_at", { ascending: false });
  if (error) throw new QueryError("plans", error);
  return data.map(({ spending_plan_lines, ...plan }) => ({
    ...(plan as SpendingPlan),
    lines: (spending_plan_lines as Record<string, unknown>[]).map(normaliseLine),
  }));
}

export async function getPlan(ctx: HouseholdContext, id: string): Promise<SpendingPlanWithLines | null> {
  const { data, error } = await ctx.supabase
    .from("spending_plans")
    .select(`id, name, notes, updated_at, updated_by, spending_plan_lines (${LINE_COLUMNS})`)
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new QueryError("plan", error);
  if (!data) return null;
  const { spending_plan_lines, ...plan } = data;
  const lines = (spending_plan_lines as Record<string, unknown>[])
    .map(normaliseLine)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  return { ...(plan as SpendingPlan), lines };
}
