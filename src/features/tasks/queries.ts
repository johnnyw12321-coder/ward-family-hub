import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  area: string;
  assigned_user_id: string | null;
  due_date: CalendarDate | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done" | "cancelled";
  recurrence_frequency: "weekly" | "monthly" | "yearly" | null;
  recurrence_interval: number;
  recurrence_anchor: CalendarDate | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ChecklistItem = { id: string; task_id: string; title: string; is_done: boolean; sort_order: number };
export type TaskComment = { id: string; body: string; created_by: string | null; created_at: string };
export type TaskCompletion = { id: string; due_date: CalendarDate | null; completed_on: CalendarDate; created_by: string | null };

const COLUMNS =
  "id, title, description, area, assigned_user_id, due_date, priority, status, recurrence_frequency, recurrence_interval, recurrence_anchor, completed_at, completed_by, created_by, created_at, updated_at";

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

export async function getOpenTasks(ctx: HouseholdContext): Promise<TaskRow[]> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("household_id", ctx.household.id)
    .in("status", ["todo", "in_progress"])
    .order("due_date", { nullsFirst: false })
    .order("priority", { ascending: false })
    .order("created_at");
  if (error) fail("tasks", error);
  return data as TaskRow[];
}

export async function getRecentlyDone(ctx: HouseholdContext, limit = 10): Promise<TaskRow[]> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("household_id", ctx.household.id)
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) fail("done tasks", error);
  return data as TaskRow[];
}

export async function getTasksDueBetween(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<TaskRow[]> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("household_id", ctx.household.id)
    .in("status", ["todo", "in_progress"])
    .gte("due_date", from)
    .lte("due_date", to);
  if (error) fail("tasks in range", error);
  return data as TaskRow[];
}

export async function getTask(ctx: HouseholdContext, id: string): Promise<TaskRow | null> {
  const { data, error } = await ctx.supabase.from("tasks").select(COLUMNS).eq("household_id", ctx.household.id).eq("id", id).maybeSingle();
  if (error) fail("task", error);
  return (data as TaskRow) ?? null;
}

export async function getChecklists(ctx: HouseholdContext, taskIds: string[]): Promise<ChecklistItem[]> {
  if (!taskIds.length) return [];
  const { data, error } = await ctx.supabase
    .from("task_checklist_items")
    .select("id, task_id, title, is_done, sort_order")
    .eq("household_id", ctx.household.id)
    .in("task_id", taskIds)
    .order("sort_order")
    .order("created_at");
  if (error) fail("checklists", error);
  return data as ChecklistItem[];
}

export async function getTaskComments(ctx: HouseholdContext, taskId: string): Promise<TaskComment[]> {
  const { data, error } = await ctx.supabase
    .from("task_comments")
    .select("id, body, created_by, created_at")
    .eq("household_id", ctx.household.id)
    .eq("task_id", taskId)
    .order("created_at");
  if (error) fail("comments", error);
  return data as TaskComment[];
}

export async function getTaskCompletions(ctx: HouseholdContext, taskId: string): Promise<TaskCompletion[]> {
  const { data, error } = await ctx.supabase
    .from("task_completions")
    .select("id, due_date, completed_on, created_by")
    .eq("household_id", ctx.household.id)
    .eq("task_id", taskId)
    .order("completed_on", { ascending: false })
    .limit(20);
  if (error) fail("completions", error);
  return data as TaskCompletion[];
}
