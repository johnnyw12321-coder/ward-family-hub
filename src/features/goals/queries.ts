import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";
import type { GoalInputs, GoalRow } from "./progress";

const GOAL_COLUMNS =
  "id, name, description, category, progress_source, target_minor, target_value, unit, start_minor, current_minor, current_value, linked_account_id, start_date, target_date, assigned_user_id, priority, status, completed_at, notes, created_at";

export type Milestone = { id: string; goal_id: string; title: string; due_date: CalendarDate | null; completed_at: string | null; completed_by: string | null; sort_order: number };
export type Contribution = { id: string; goal_id: string; contributed_on: CalendarDate; amount_minor: number; note: string | null; created_by: string | null };

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

function normalise(r: Record<string, unknown>): GoalRow {
  return {
    ...(r as GoalRow),
    target_minor: r.target_minor === null ? null : Number(r.target_minor),
    start_minor: Number(r.start_minor),
    current_minor: Number(r.current_minor),
    target_value: r.target_value === null ? null : String(r.target_value),
    current_value: String(r.current_value),
  };
}

export async function getGoals(ctx: HouseholdContext): Promise<GoalRow[]> {
  const { data, error } = await ctx.supabase
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("household_id", ctx.household.id)
    .order("status")
    .order("priority", { ascending: false })
    .order("target_date", { nullsFirst: false });
  if (error) fail("goals", error);
  return data.map(normalise);
}

export async function getGoal(ctx: HouseholdContext, id: string): Promise<GoalRow | null> {
  const { data, error } = await ctx.supabase.from("goals").select(GOAL_COLUMNS).eq("household_id", ctx.household.id).eq("id", id).maybeSingle();
  if (error) fail("goal", error);
  return data ? normalise(data) : null;
}

export async function getMilestones(ctx: HouseholdContext, goalIds: string[]): Promise<Milestone[]> {
  if (!goalIds.length) return [];
  const { data, error } = await ctx.supabase
    .from("goal_milestones")
    .select("id, goal_id, title, due_date, completed_at, completed_by, sort_order")
    .eq("household_id", ctx.household.id)
    .in("goal_id", goalIds)
    .order("sort_order")
    .order("due_date", { nullsFirst: false });
  if (error) fail("milestones", error);
  return data as Milestone[];
}

export async function getContributions(ctx: HouseholdContext, goalIds: string[]): Promise<Contribution[]> {
  if (!goalIds.length) return [];
  const { data, error } = await ctx.supabase
    .from("goal_contributions")
    .select("id, goal_id, contributed_on, amount_minor, note, created_by")
    .eq("household_id", ctx.household.id)
    .in("goal_id", goalIds)
    .order("contributed_on", { ascending: false });
  if (error) fail("contributions", error);
  return data.map((c) => ({ ...(c as Contribution), amount_minor: Number(c.amount_minor) }));
}

/** Inputs needed to compute progress for each goal, keyed by goal id. */
export function buildInputs(
  goals: GoalRow[],
  balances: Map<string, number>,
  milestones: Milestone[],
  contributions: Contribution[],
): Map<string, GoalInputs> {
  const out = new Map<string, GoalInputs>();
  for (const g of goals) {
    const ms = milestones.filter((m) => m.goal_id === g.id);
    out.set(g.id, {
      accountBalanceMinor: g.linked_account_id ? (balances.get(g.linked_account_id) ?? 0) : undefined,
      contributionsMinor: contributions.filter((c) => c.goal_id === g.id).reduce((s, c) => s + c.amount_minor, 0),
      milestones: { total: ms.length, done: ms.filter((m) => m.completed_at).length },
    });
  }
  return out;
}
