"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { isCalendarDate } from "@/lib/dates";
import { REMINDER_SOURCES } from "./reminders";

const uuid = z.uuid();

/** Mark one notification read; read-only members can manage their own inbox. */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid notification.");
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("household_id", ctx.household.id)
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .is("read_at", null);
  if (error) {
    logServerError("markNotificationRead", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null);
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("household_id", ctx.household.id)
    .eq("user_id", ctx.userId)
    .is("read_at", null);
  if (error) {
    logServerError("markAllNotificationsRead", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "All caught up");
}

export async function dismissNotification(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid notification.");
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ dismissed_at: now, read_at: now })
    .eq("household_id", ctx.household.id)
    .eq("user_id", ctx.userId)
    .eq("id", id);
  if (error) {
    logServerError("dismissNotification", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Dismissed");
}

const reminderSchema = z.object({
  source: z.enum(REMINDER_SOURCES),
  itemId: z.uuid(),
  leadDays: z.number().int().min(0).max(60).nullable(),
  muted: z.boolean(),
  snoozedUntil: z.string().refine(isCalendarDate).nullable(),
});

/**
 * Change an item's reminder for the whole household: how early it starts,
 * off, or snoozed. Its current notifications are cleared and recreated under
 * the new setting straight away.
 */
export async function saveReminder(raw: unknown): Promise<ActionResult> {
  const parsed = reminderSchema.safeParse(raw);
  if (!parsed.success) return fail("Those reminder settings aren't valid.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  if (v.snoozedUntil && v.snoozedUntil <= ctx.today) return fail("Choose a snooze date after today.");
  const { error } = await ctx.supabase.rpc("set_reminder", {
    p_household_id: ctx.household.id,
    p_source: v.source,
    p_item_id: v.itemId,
    p_lead_days: v.leadDays,
    p_muted: v.muted,
    p_snoozed_until: v.snoozedUntil,
  });
  if (error) {
    logServerError("saveReminder", error);
    return fail(dbErrorMessage(error));
  }
  const again = await ctx.supabase.rpc("refresh_notifications", { p_household_id: ctx.household.id, p_today: ctx.today });
  if (again.error) logServerError("saveReminder.refresh", again.error);
  refresh();
  return ok(null, v.muted ? "Reminder turned off" : v.snoozedUntil ? "Reminder snoozed" : "Reminder updated");
}
