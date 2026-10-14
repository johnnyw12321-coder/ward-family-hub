import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";

export type NotificationRow = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  link_path: string | null;
  due_on: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Generate any due notifications (idempotent, server-side, as the caller),
 * then return the unread count. Failure to generate never breaks the page.
 */
export async function refreshAndCountUnread(ctx: HouseholdContext): Promise<number> {
  if (ctx.canWrite) {
    const { error } = await ctx.supabase.rpc("refresh_notifications", { p_household_id: ctx.household.id, p_today: ctx.today });
    if (error) console.error("[notifications:refresh]", { code: error.code, message: error.message });
  }
  const { count, error } = await ctx.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("household_id", ctx.household.id)
    .eq("user_id", ctx.userId)
    .is("read_at", null)
    .is("dismissed_at", null);
  if (error) {
    console.error("[notifications:count]", { code: error.code, message: error.message });
    return 0;
  }
  return count ?? 0;
}

export async function getNotifications(ctx: HouseholdContext, limit = 60): Promise<NotificationRow[]> {
  const { data, error } = await ctx.supabase
    .from("notifications")
    .select("id, kind, severity, title, body, link_path, due_on, read_at, created_at")
    .eq("household_id", ctx.household.id)
    .eq("user_id", ctx.userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[query:notifications]", { code: error.code, message: error.message });
    throw new Error("Could not load notifications");
  }
  return data as NotificationRow[];
}
