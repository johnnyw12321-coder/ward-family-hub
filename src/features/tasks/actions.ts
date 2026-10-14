"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { parseMoney } from "@/lib/money";
import { parsePreset } from "@/lib/recurrence";
import { quickTaskSchema, shoppingItemSchema, taskSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

async function ctxOrFail() {
  const auth = await getActionContext();
  return auth;
}

function done<T>(error: { code?: string; message?: string } | null, scope: string, message: string, data: T): ActionResult<T> {
  if (error) {
    logServerError(scope, error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(data, message);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function saveTask(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const schedule = v.schedule ? parsePreset(v.schedule) : null;
  const row = {
    title: v.title,
    description: empty(v.description),
    area: v.area,
    assigned_user_id: empty(v.assignedUserId),
    due_date: empty(v.dueDate),
    priority: v.priority,
    recurrence_frequency: schedule?.frequency ?? null,
    recurrence_interval: schedule?.interval ?? 1,
    recurrence_anchor: schedule ? empty(v.dueDate) : null,
  };
  const res = v.id
    ? await ctx.supabase.from("tasks").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id")
    : await ctx.supabase.from("tasks").insert({ ...row, household_id: ctx.household.id }).select("id");
  if (res.error) {
    logServerError("saveTask", res.error);
    return fail(dbErrorMessage(res.error));
  }
  if (!res.data?.length) return fail("That task no longer exists.");
  refresh();
  return ok({ id: res.data[0].id as string }, v.id ? "Task updated" : "Task added");
}

export async function quickAddTask(raw: unknown): Promise<ActionResult> {
  const parsed = quickTaskSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the task.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("tasks").insert({
    household_id: ctx.household.id,
    title: parsed.data.title,
    due_date: empty(parsed.data.dueDate),
    assigned_user_id: empty(parsed.data.assignedUserId),
  });
  return done(error, "quickAddTask", "Task added", null);
}

export async function completeTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid task.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.rpc("complete_task", {
    p_household_id: ctx.household.id,
    p_task_id: id,
    p_completed_on: ctx.today,
  });
  if (error) {
    logServerError("completeTask", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, data ? "Done — next one scheduled" : "Task done");
}

export async function setTaskStatus(id: string, status: "todo" | "in_progress" | "cancelled"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !["todo", "in_progress", "cancelled"].includes(status)) return fail("Invalid request.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase
    .from("tasks")
    .update({ status, completed_at: null, completed_by: null })
    .eq("household_id", ctx.household.id)
    .eq("id", id);
  return done(error, "setTaskStatus", status === "todo" ? "Task reopened" : status === "cancelled" ? "Task cancelled" : "Marked in progress", null);
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid task.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("tasks").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteTask", "Task deleted", null);
}

export async function addChecklistItem(taskId: string, title: string): Promise<ActionResult> {
  const t = z.string().trim().min(1).max(200).safeParse(title);
  if (!uuid.safeParse(taskId).success || !t.success) return fail("Enter a checklist item.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase
    .from("task_checklist_items")
    .insert({ household_id: ctx.household.id, task_id: taskId, title: t.data });
  return done(error, "addChecklistItem", "Added", null);
}

export async function toggleChecklistItem(id: string, isDone: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("task_checklist_items").update({ is_done: isDone }).eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "toggleChecklistItem", isDone ? "Checked" : "Unchecked", null);
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("task_checklist_items").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteChecklistItem", "Removed", null);
}

export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  const b = z.string().trim().min(1).max(2000).safeParse(body);
  if (!uuid.safeParse(taskId).success || !b.success) return fail("Write a comment first.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("task_comments").insert({ household_id: ctx.household.id, task_id: taskId, body: b.data });
  return done(error, "addComment", "Comment added", null);
}

export async function deleteComment(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid comment.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.from("task_comments").delete().eq("household_id", ctx.household.id).eq("id", id).select("id");
  if (!error && !data?.length) return fail("You can only delete your own comments.");
  return done(error, "deleteComment", "Comment deleted", null);
}

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------
const listName = z.string().trim().min(1, "Name the list").max(80);

export async function createShoppingList(name: string, isTemplate = false): Promise<ActionResult<{ id: string }>> {
  const n = listName.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("shopping_lists")
    .insert({ household_id: ctx.household.id, name: n.data, is_template: isTemplate })
    .select("id")
    .single();
  if (error) {
    logServerError("createShoppingList", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok({ id: data.id as string }, "List created");
}

export async function copyShoppingList(listId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const n = listName.safeParse(name);
  if (!uuid.safeParse(listId).success || !n.success) return fail("Name the new list.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.rpc("copy_shopping_list", { p_household_id: ctx.household.id, p_list_id: listId, p_name: n.data });
  if (error) {
    logServerError("copyShoppingList", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok({ id: data as string }, "New list ready");
}

export async function updateShoppingList(listId: string, patch: { name?: string; isTemplate?: boolean; isArchived?: boolean }): Promise<ActionResult> {
  if (!uuid.safeParse(listId).success) return fail("Invalid list.");
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = listName.safeParse(patch.name);
    if (!n.success) return fail(n.error.issues[0].message);
    row.name = n.data;
  }
  if (patch.isTemplate !== undefined) row.is_template = patch.isTemplate;
  if (patch.isArchived !== undefined) row.is_archived = patch.isArchived;
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("shopping_lists").update(row).eq("household_id", ctx.household.id).eq("id", listId);
  return done(error, "updateShoppingList", patch.isArchived ? "List archived" : "List updated", null);
}

export async function deleteShoppingList(listId: string): Promise<ActionResult> {
  if (!uuid.safeParse(listId).success) return fail("Invalid list.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("shopping_lists").delete().eq("household_id", ctx.household.id).eq("id", listId);
  return done(error, "deleteShoppingList", "List deleted", null);
}

export async function saveShoppingItem(raw: unknown): Promise<ActionResult> {
  const parsed = shoppingItemSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the item.");
  const v = parsed.data;
  let price: number | null = null;
  if (v.price) {
    price = parseMoney(v.price);
    if (price === null || price < 0) return fail("Enter a valid price, e.g. 18.50");
  }
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const row = { name: v.name, quantity: empty(v.quantity), estimated_price_minor: price };
  const { error } = v.id
    ? await ctx.supabase.from("shopping_items").update(row).eq("household_id", ctx.household.id).eq("id", v.id)
    : await ctx.supabase.from("shopping_items").insert({ ...row, household_id: ctx.household.id, list_id: v.listId });
  return done(error, "saveShoppingItem", v.id ? "Item updated" : "Added", null);
}

export async function toggleShoppingItem(id: string, checked: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("shopping_items").update({ is_checked: checked }).eq("household_id", ctx.household.id).eq("id", id);
  if (error) {
    logServerError("toggleShoppingItem", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null);
}

export async function deleteShoppingItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("shopping_items").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteShoppingItem", "Removed", null);
}

export async function bulkShoppingAction(listId: string, action: "uncheck_all" | "clear_checked"): Promise<ActionResult> {
  if (!uuid.safeParse(listId).success) return fail("Invalid list.");
  const auth = await ctxOrFail();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const base = ctx.supabase.from("shopping_items");
  const { error } =
    action === "uncheck_all"
      ? await base.update({ is_checked: false }).eq("household_id", ctx.household.id).eq("list_id", listId).eq("is_checked", true)
      : await base.delete().eq("household_id", ctx.household.id).eq("list_id", listId).eq("is_checked", true);
  return done(error, "bulkShoppingAction", action === "uncheck_all" ? "All items unchecked" : "Checked items cleared", null);
}
