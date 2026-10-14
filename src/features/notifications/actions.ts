"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";

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
