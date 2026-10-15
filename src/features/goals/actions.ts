"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { parseMoney } from "@/lib/money";
import { contributionSchema, goalSchema, manualProgressSchema, milestoneSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

export async function saveGoal(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const usesMoney = v.progressSource !== "manual" || v.measure === "money";

  // Baselines for account-driven goals come from the ledger when the goal
  // starts following an account: at creation, or when an edit switches the
  // source or the account. Otherwise the original baseline is kept.
  let startMinor: number | undefined;
  let followsNewAccount = !v.id;
  if (v.id) {
    const { data: existing, error } = await ctx.supabase
      .from("goals")
      .select("progress_source, linked_account_id")
      .eq("household_id", ctx.household.id)
      .eq("id", v.id)
      .maybeSingle();
    if (error) {
      logServerError("saveGoal.read", error);
      return fail(dbErrorMessage(error));
    }
    if (!existing) return fail("That goal no longer exists.");
    followsNewAccount = existing.progress_source !== v.progressSource || existing.linked_account_id !== (v.linkedAccountId || null);
  }
  if (followsNewAccount && v.linkedAccountId && (v.progressSource === "account_balance" || v.progressSource === "debt_payoff")) {
    const { data } = await ctx.supabase
      .from("account_balances")
      .select("balance_minor")
      .eq("household_id", ctx.household.id)
      .eq("account_id", v.linkedAccountId)
      .maybeSingle();
    const balance = Number(data?.balance_minor ?? 0);
    startMinor = v.progressSource === "debt_payoff" ? Math.max(0, -balance) : balance;
    if (v.progressSource === "debt_payoff" && startMinor === 0) {
      return fail("That account has nothing owed on it, so there's nothing to pay off.", { linkedAccountId: "Nothing owed" });
    }
  }

  // Target: money for most goals, a number for manual "number" goals, none for
  // milestone goals. Debt payoff defaults to paying off everything owed now.
  let target: { target_minor?: number | null; target_value?: string | null; unit?: string | null };
  if (v.progressSource === "milestones") {
    target = { target_minor: null, target_value: null, unit: null };
  } else if (v.progressSource === "debt_payoff") {
    const explicit = v.targetAmount ? parseMoney(v.targetAmount) : null;
    target = explicit ? { target_minor: explicit } : startMinor !== undefined ? { target_minor: startMinor } : {};
    target = { ...target, target_value: null, unit: null };
  } else if (usesMoney) {
    target = { target_minor: parseMoney(v.targetAmount ?? "") || null, target_value: null, unit: null };
  } else {
    target = { target_minor: null, target_value: v.targetValue || null, unit: empty(v.unit) };
  }

  const row = {
    name: v.name,
    description: empty(v.description),
    category: v.category,
    progress_source: v.progressSource,
    ...target,
    linked_account_id: v.progressSource === "account_balance" || v.progressSource === "debt_payoff" ? empty(v.linkedAccountId) : null,
    start_date: v.startDate,
    target_date: empty(v.targetDate),
    assigned_user_id: empty(v.assignedUserId),
    priority: v.priority,
    notes: empty(v.notes),
    ...(startMinor !== undefined ? { start_minor: startMinor } : {}),
  };

  const res = v.id
    ? await ctx.supabase.from("goals").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id")
    : await ctx.supabase.from("goals").insert({ ...row, household_id: ctx.household.id }).select("id");
  if (res.error) {
    logServerError("saveGoal", res.error);
    return fail(dbErrorMessage(res.error));
  }
  if (!res.data?.length) return fail("That goal no longer exists.");
  refresh();
  return ok({ id: res.data[0].id as string }, v.id ? "Goal updated" : "Goal created");
}

const statusSchema = z.enum(["not_started", "in_progress", "on_hold", "completed", "cancelled"]);

export async function setGoalStatus(id: string, status: string): Promise<ActionResult> {
  const s = statusSchema.safeParse(status);
  if (!uuid.safeParse(id).success || !s.success) return fail("Invalid request.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("goals")
    .update({ status: s.data, completed_at: s.data === "completed" ? new Date().toISOString() : null })
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("setGoalStatus", error);
    return fail(dbErrorMessage(error, "Could not update the goal."));
  }
  refresh();
  return ok(null, s.data === "completed" ? "Goal completed — well done!" : "Goal updated");
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid goal.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.from("goals").delete().eq("household_id", ctx.household.id).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) logServerError("deleteGoal", error);
    return fail(dbErrorMessage(error, "Could not delete the goal."));
  }
  refresh();
  return ok(null, "Goal deleted");
}

export async function updateManualProgress(raw: unknown): Promise<ActionResult> {
  const parsed = manualProgressSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter a valid value.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const patch = v.amount !== undefined && v.amount !== "" ? { current_minor: parseMoney(v.amount) ?? 0 } : { current_value: v.value || "0" };
  const { error } = await ctx.supabase.from("goals").update(patch).eq("household_id", ctx.household.id).eq("id", v.goalId);
  if (error) {
    logServerError("updateManualProgress", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Progress updated");
}

export async function addMilestone(raw: unknown): Promise<ActionResult> {
  const parsed = milestoneSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the milestone.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("goal_milestones").insert({
    household_id: ctx.household.id,
    goal_id: parsed.data.goalId,
    title: parsed.data.title,
    due_date: empty(parsed.data.dueDate),
  });
  if (error) {
    logServerError("addMilestone", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Milestone added");
}

export async function toggleMilestone(id: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid milestone.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase
    .from("goal_milestones")
    .update({ completed_at: done ? new Date().toISOString() : null, completed_by: done ? ctx.userId : null })
    .eq("household_id", ctx.household.id)
    .eq("id", id);
  if (error) {
    logServerError("toggleMilestone", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, done ? "Milestone reached" : "Milestone reopened");
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid milestone.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("goal_milestones").delete().eq("household_id", ctx.household.id).eq("id", id);
  if (error) {
    logServerError("deleteMilestone", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Milestone removed");
}

export async function addContribution(raw: unknown): Promise<ActionResult> {
  const parsed = contributionSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the contribution.", zodFieldErrors(parsed.error));
  const amount = parseMoney(parsed.data.amount);
  if (!amount) return fail("Enter a non-zero amount.", { amount: "Enter a non-zero amount" });
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("goal_contributions").insert({
    household_id: ctx.household.id,
    goal_id: parsed.data.goalId,
    contributed_on: parsed.data.date,
    amount_minor: amount,
    note: empty(parsed.data.note),
  });
  if (error) {
    logServerError("addContribution", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, amount > 0 ? "Contribution recorded" : "Withdrawal recorded");
}

export async function deleteContribution(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid contribution.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("goal_contributions").delete().eq("household_id", ctx.household.id).eq("id", id);
  if (error) {
    logServerError("deleteContribution", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Contribution removed");
}
