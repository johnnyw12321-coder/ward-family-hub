"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getBudgetProgress, getCategories, getRecurringItems } from "@/features/finance/queries";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext, type HouseholdContext } from "@/lib/auth/context";
import { monthStart } from "@/lib/dates";
import { fromRecurring, PLAN_FREQUENCIES, STARTER_EXPENSES, type PlanFrequency, type PlanLineKind } from "./calc";

const uuid = z.uuid();

const MAX_AMOUNT = 10_000_000_000_000;

const lineSchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  kind: z.enum(["income", "expense"]),
  label: z.string().trim().max(80, "Keep it under 80 characters"),
  amountMinor: z.number().int().min(0).max(MAX_AMOUNT),
  frequency: z.enum(PLAN_FREQUENCIES),
  sortOrder: z.number().int().min(0).max(100_000),
});
export type PlanLineInput = z.infer<typeof lineSchema>;

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the plan a name").max(80),
  start: z.enum(["actual", "starter", "blank"]),
});
export type CreatePlanInput = z.infer<typeof createSchema>;

type NewLine = { kind: PlanLineKind; label: string; amount_minor: number; frequency: PlanFrequency };

/**
 * Save one line (create or update). The editor gives each new line its id up
 * front, so typing never waits on the server. No refresh(): the editor already
 * holds the state, and re-rendering would fight with someone mid-typing.
 */
export async function savePlanLine(raw: unknown): Promise<ActionResult> {
  const parsed = lineSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check this line.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const { error } = await ctx.supabase.from("spending_plan_lines").upsert({
    id: v.id,
    household_id: ctx.household.id,
    plan_id: v.planId,
    kind: v.kind,
    label: v.label,
    amount_minor: v.amountMinor,
    frequency: v.frequency,
    sort_order: v.sortOrder,
  });
  if (error) {
    logServerError("savePlanLine", error);
    return fail(dbErrorMessage(error, "Could not save this line."));
  }
  return ok(null);
}

export async function deletePlanLine(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid line.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  // Deleting a line that was never saved is fine: nothing to remove.
  const { error } = await ctx.supabase.from("spending_plan_lines").delete().eq("household_id", ctx.household.id).eq("id", id);
  if (error) {
    logServerError("deletePlanLine", error);
    return fail(dbErrorMessage(error, "Could not remove this line."));
  }
  return ok(null);
}

async function insertLines(ctx: HouseholdContext, planId: string, lines: NewLine[]) {
  if (!lines.length) return null;
  const counters = { income: 0, expense: 0 };
  const { error } = await ctx.supabase.from("spending_plan_lines").insert(
    lines.map((l) => ({
      household_id: ctx.household.id,
      plan_id: planId,
      ...l,
      sort_order: (counters[l.kind] += 1),
    })),
  );
  return error;
}

/** Lines that mirror the household's real numbers: active bills and income, plus this month's budgets. */
async function actualLines(ctx: HouseholdContext): Promise<NewLine[]> {
  const [recurring, budget, categories] = await Promise.all([
    getRecurringItems(ctx),
    getBudgetProgress(ctx, monthStart(ctx.today)),
    getCategories(ctx, { kind: "expense" }),
  ]);
  const lines: NewLine[] = [];
  const billCategories = new Set<string>();
  for (const item of recurring) {
    if (item.currency !== ctx.household.base_currency) continue;
    if (item.direction === "bill" && item.category_id) billCategories.add(item.category_id);
    lines.push({
      kind: item.direction === "income" ? "income" : "expense",
      label: item.name.slice(0, 80),
      ...fromRecurring(item.amount_minor, item.frequency, item.interval_count),
    });
  }
  // A budget for a category a bill already covers would count that money twice.
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  const coveredByBill = (id: string) => billCategories.has(id) || [...billCategories].some((b) => parentOf.get(b) === id);
  for (const row of budget) {
    if (!row.allocation_id || !row.category_id || row.allocated_minor <= 0 || coveredByBill(row.category_id)) continue;
    lines.push({ kind: "expense", label: row.category_name.slice(0, 80), amount_minor: row.allocated_minor, frequency: "monthly" });
  }
  return lines;
}

export async function createPlan(raw: unknown): Promise<ActionResult<{ id: string; imported: number }>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;

  let lines: NewLine[] = [];
  try {
    if (v.start === "actual") lines = await actualLines(ctx);
  } catch (e) {
    logServerError("createPlan.actual", e);
    return fail("Could not read your bills and budgets. Please try again.");
  }
  if (v.start === "starter") {
    lines = [
      ...ctx.members
        .filter((m) => m.role !== "viewer")
        .map((m) => ({ kind: "income" as const, label: `${m.display_name}'s salary`.slice(0, 80), amount_minor: 0, frequency: "monthly" as const })),
      ...STARTER_EXPENSES.map((l) => ({ kind: "expense" as const, label: l.label, amount_minor: 0, frequency: l.frequency })),
    ];
  }

  const plan = await ctx.supabase
    .from("spending_plans")
    .insert({ household_id: ctx.household.id, name: v.name })
    .select("id")
    .single();
  if (plan.error) {
    logServerError("createPlan", plan.error);
    return fail(dbErrorMessage(plan.error, "Could not create the plan."));
  }
  const error = await insertLines(ctx, plan.data.id, lines);
  if (error) {
    logServerError("createPlan.lines", error);
    await ctx.supabase.from("spending_plans").delete().eq("household_id", ctx.household.id).eq("id", plan.data.id);
    return fail(dbErrorMessage(error, "Could not create the plan."));
  }
  refresh();
  return ok({ id: plan.data.id, imported: lines.length }, "Plan created");
}

export async function duplicatePlan(id: string): Promise<ActionResult<{ id: string }>> {
  if (!uuid.safeParse(id).success) return fail("Invalid plan.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const source = await ctx.supabase
    .from("spending_plans")
    .select("name, notes, spending_plan_lines (kind, label, amount_minor, frequency, sort_order)")
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (source.error || !source.data) {
    if (source.error) logServerError("duplicatePlan.read", source.error);
    return fail(dbErrorMessage(source.error, "That plan could not be found."));
  }
  const name = `${source.data.name} (copy)`.slice(0, 80);
  const plan = await ctx.supabase
    .from("spending_plans")
    .insert({ household_id: ctx.household.id, name, notes: source.data.notes })
    .select("id")
    .single();
  if (plan.error) {
    logServerError("duplicatePlan", plan.error);
    return fail(dbErrorMessage(plan.error, "Could not copy the plan."));
  }
  const lines = source.data.spending_plan_lines as Record<string, unknown>[];
  if (lines.length) {
    const { error } = await ctx.supabase
      .from("spending_plan_lines")
      .insert(lines.map((l) => ({ ...l, household_id: ctx.household.id, plan_id: plan.data.id })));
    if (error) {
      logServerError("duplicatePlan.lines", error);
      await ctx.supabase.from("spending_plans").delete().eq("household_id", ctx.household.id).eq("id", plan.data.id);
      return fail(dbErrorMessage(error, "Could not copy the plan."));
    }
  }
  refresh();
  return ok({ id: plan.data.id }, "Copy created");
}

const renameSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Give the plan a name").max(80),
  notes: z.string().trim().max(4000),
});

export async function updatePlan(raw: unknown): Promise<ActionResult> {
  const parsed = renameSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("spending_plans")
    .update({ name: parsed.data.name, notes: parsed.data.notes || null })
    .eq("household_id", ctx.household.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("updatePlan", error);
    return fail(dbErrorMessage(error, "Could not update the plan."));
  }
  refresh();
  return ok(null, "Plan updated");
}

export async function deletePlan(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid plan.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("spending_plans")
    .delete()
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("deletePlan", error);
    return fail(dbErrorMessage(error, "Could not delete the plan."));
  }
  return ok(null, "Plan deleted");
}
