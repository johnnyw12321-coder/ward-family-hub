import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import { REMINDER_INFO, reminderKey, type ReminderSource, type ReminderState } from "./reminders";

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
  dedupe_key: string;
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
    .select("id, kind, severity, title, body, link_path, due_on, read_at, created_at, dedupe_key")
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

/**
 * The current reminder for each notification that has one, keyed by
 * notification id: how early it starts, and whether it's off or snoozed.
 * Timing for bills, events and documents is read from the item itself.
 */
export async function getReminderStates(ctx: HouseholdContext, rows: NotificationRow[]): Promise<Map<string, ReminderState>> {
  const keys = new Map<string, { source: ReminderSource; keyId: string }>();
  for (const r of rows) {
    const k = reminderKey(r.dedupe_key);
    if (k) keys.set(r.id, k);
  }
  const ids = (source: ReminderSource) => [...new Set([...keys.values()].filter((k) => k.source === source).map((k) => k.keyId))];
  const hh = ctx.household.id;
  const db = ctx.supabase;

  // Budget notifications name the month's allocation; settings belong to the category.
  const allocations = ids("budget");
  const categoryOf = new Map<string, string>();
  if (allocations.length) {
    const { data } = await db.from("budget_allocations").select("id, category_id").eq("household_id", hh).in("id", allocations);
    for (const a of data ?? []) categoryOf.set(a.id, a.category_id);
  }
  const itemId = (k: { source: ReminderSource; keyId: string }) => (k.source === "budget" ? categoryOf.get(k.keyId) : k.keyId);

  const itemIds = [...new Set([...keys.values()].map(itemId).filter((x): x is string => Boolean(x)))];
  const [settings, bills, events, documents] = await Promise.all([
    itemIds.length ? db.from("reminder_settings").select("source, item_id, lead_days, muted, snoozed_until").eq("household_id", hh).in("item_id", itemIds) : { data: [] },
    ids("bill").length ? db.from("recurring_items").select("id, reminder_days_before").eq("household_id", hh).in("id", ids("bill")) : { data: [] },
    ids("event").length ? db.from("calendar_events").select("id, reminder_minutes").eq("household_id", hh).in("id", ids("event")) : { data: [] },
    ids("document").length ? db.from("documents").select("id, expiry_reminder_days").eq("household_id", hh).in("id", ids("document")) : { data: [] },
  ]);
  const setting = new Map((settings.data ?? []).map((s) => [`${s.source}:${s.item_id}`, s]));
  const native = new Map<string, number>([
    ...(bills.data ?? []).map((b): [string, number] => [`bill:${b.id}`, Number(b.reminder_days_before)]),
    ...(events.data ?? []).map((e): [string, number] => [`event:${e.id}`, Math.round(Math.max(0, ...((e.reminder_minutes as number[]) ?? [0])) / 1440)]),
    ...(documents.data ?? []).map((d): [string, number] => [`document:${d.id}`, Number(d.expiry_reminder_days)]),
  ]);

  const out = new Map<string, ReminderState>();
  for (const [notificationId, k] of keys) {
    const id = itemId(k);
    if (!id) continue;
    const s = setting.get(`${k.source}:${id}`);
    const lead = native.get(`${k.source}:${id}`) ?? (s?.lead_days === null || s?.lead_days === undefined ? REMINDER_INFO[k.source].defaultLead : Number(s.lead_days));
    out.set(notificationId, {
      source: k.source,
      itemId: id,
      leadDays: REMINDER_INFO[k.source].leads ? lead : null,
      muted: Boolean(s?.muted),
      snoozedUntil: s?.snoozed_until ?? null,
    });
  }
  return out;
}

export type QuietReminder = { source: ReminderSource; itemId: string; name: string; muted: boolean; snoozedUntil: string | null; leadDays: number | null };

const NAME_LOOKUP: Record<ReminderSource, { table: string; column: string } | null> = {
  bill: { table: "recurring_items", column: "name" },
  task: { table: "tasks", column: "title" },
  event: { table: "calendar_events", column: "title" },
  goal: { table: "goals", column: "name" },
  milestone: { table: "goal_milestones", column: "title" },
  budget: { table: "transaction_categories", column: "name" },
  document: null, // names of sensitive documents stay hidden; handled below
  vehicle: { table: "assets", column: "name" },
  maintenance: { table: "asset_records", column: "title" },
  warranty: { table: "asset_items", column: "name" },
  family: null, // a family member's birthday or one of their dates; handled below
};

/** Reminders that are turned off or snoozed, so they can be turned back on. */
export async function getQuietReminders(ctx: HouseholdContext): Promise<QuietReminder[]> {
  const hh = ctx.household.id;
  const db = ctx.supabase;
  const { data, error } = await db
    .from("reminder_settings")
    .select("source, item_id, lead_days, muted, snoozed_until")
    .eq("household_id", hh)
    .or(`muted.eq.true,snoozed_until.gt.${ctx.today}`)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[query:quietReminders]", { code: error.code, message: error.message });
    return [];
  }
  const rows = data ?? [];
  const names = new Map<string, string>();
  const bySource = (s: ReminderSource) => rows.filter((r) => r.source === s).map((r) => r.item_id as string);
  await Promise.all(
    (Object.keys(NAME_LOOKUP) as ReminderSource[]).map(async (source) => {
      const ids = bySource(source);
      if (!ids.length) return;
      const lookup = NAME_LOOKUP[source];
      if (lookup) {
        const res = await db.from(lookup.table).select(`id, ${lookup.column}`).eq("household_id", hh).in("id", ids);
        for (const r of (res.data ?? []) as unknown as Record<string, string>[]) names.set(`${source}:${r.id}`, r[lookup.column]);
      } else if (source === "document") {
        const res = await db.from("documents").select("id, name, is_sensitive").eq("household_id", hh).in("id", ids);
        for (const d of res.data ?? []) names.set(`document:${d.id}`, d.is_sensitive ? "A sensitive document" : d.name);
      } else {
        const [people, dates] = await Promise.all([
          db.from("family_members").select("id, full_name, preferred_name").eq("household_id", hh).in("id", ids),
          db.from("family_dates").select("id, title").eq("household_id", hh).in("id", ids),
        ]);
        for (const p of people.data ?? []) names.set(`family:${p.id}`, `${p.preferred_name || p.full_name}’s birthday`);
        for (const d of dates.data ?? []) names.set(`family:${d.id}`, d.title);
      }
    }),
  );
  return rows
    .map((r) => ({
      source: r.source as ReminderSource,
      itemId: r.item_id as string,
      name: names.get(`${r.source}:${r.item_id}`) ?? "",
      muted: Boolean(r.muted),
      snoozedUntil: r.muted ? null : (r.snoozed_until as string | null),
      leadDays: r.lead_days === null ? null : Number(r.lead_days),
    }))
    .filter((r) => r.name); // items deleted since
}
