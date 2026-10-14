import "server-only";
import { getAssetItems, getAssets } from "@/features/assets/queries";
import { getExpiringDocuments } from "@/features/documents/queries";
import { getFamilyDates, getFamilyMembers } from "@/features/family/queries";
import { occurrencesBetween } from "@/lib/recurrence";
import { getRecurringItems } from "@/features/finance/queries";
import { getGoals, getMilestones } from "@/features/goals/queries";
import { getTasksDueBetween } from "@/features/tasks/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";
import { expandBills, expandEvents, type CalendarItem, type EventRow } from "./expand";

const EVENT_COLUMNS =
  "id, title, description, location, category, all_day, starts_at, ends_at, start_date, recurrence_frequency, recurrence_interval, recurrence_until, reminder_minutes, is_completed, family_member_id, asset_id, event_participants(user_id)";

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

function normalise(r: Record<string, unknown>): EventRow {
  const participants = (r.event_participants as { user_id: string }[] | null) ?? [];
  const { event_participants: _omit, ...rest } = r;
  void _omit;
  return { ...(rest as Omit<EventRow, "participants">), participants: participants.map((p) => p.user_id) };
}

/** Events that could appear between from and to (including recurring series). */
export async function getEventsBetween(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<EventRow[]> {
  const [single, recurring] = await Promise.all([
    ctx.supabase
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("household_id", ctx.household.id)
      .is("recurrence_frequency", null)
      // overlap: starts on/before the window end and ends on/after the window start (padded a day for timezones)
      .lte("start_date", to)
      .gte("ends_at", `${from}T00:00:00Z`),
    ctx.supabase
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("household_id", ctx.household.id)
      .not("recurrence_frequency", "is", null)
      .lte("start_date", to)
      .or(`recurrence_until.is.null,recurrence_until.gte.${from}`),
  ]);
  if (single.error) fail("events", single.error);
  if (recurring.error) fail("recurring events", recurring.error);
  return [...single.data, ...recurring.data].map(normalise);
}

export async function getEvent(ctx: HouseholdContext, id: string): Promise<EventRow | null> {
  const { data, error } = await ctx.supabase.from("calendar_events").select(EVENT_COLUMNS).eq("household_id", ctx.household.id).eq("id", id).maybeSingle();
  if (error) fail("event", error);
  return data ? normalise(data) : null;
}

export async function getCompletions(ctx: HouseholdContext, eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const { data, error } = await ctx.supabase
    .from("event_completions")
    .select("event_id, occurrence_date")
    .eq("household_id", ctx.household.id)
    .in("event_id", eventIds);
  if (error) fail("event completions", error);
  return new Set(data.map((c) => `${c.event_id}:${c.occurrence_date}`));
}

/** Everything that belongs on the calendar for a date range. */
export async function getCalendarItems(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<CalendarItem[]> {
  const [events, bills, tasks, goals, documents, family, familyDates, assets, assetItems] = await Promise.all([
    getEventsBetween(ctx, from, to),
    getRecurringItems(ctx),
    getTasksDueBetween(ctx, from, to),
    getGoals(ctx),
    getExpiringDocuments(ctx, from, to),
    getFamilyMembers(ctx),
    getFamilyDates(ctx),
    getAssets(ctx),
    getAssetItems(ctx),
  ]);
  const familyName = new Map(family.map((m) => [m.id, m.preferred_name ?? m.full_name]));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const inRange = (d: string | null): d is string => Boolean(d && d >= from && d <= to);
  const openGoals = goals.filter((g) => g.status === "in_progress" || g.status === "not_started");
  const [completions, milestones] = await Promise.all([
    getCompletions(ctx, events.filter((e) => e.recurrence_frequency).map((e) => e.id)),
    getMilestones(ctx, openGoals.map((g) => g.id)),
  ]);

  const items: CalendarItem[] = [
    ...expandEvents(events, from, to, ctx.household.timezone, completions),
    ...expandBills(bills, from, to),
    ...tasks
      .filter((t) => t.due_date)
      .map<CalendarItem>((t) => ({
        key: `task:${t.id}`,
        kind: "task",
        sourceId: t.id,
        date: t.due_date!,
        time: null,
        endTime: null,
        title: t.title,
        href: `/tasks/${t.id}`,
      })),
    ...openGoals
      .filter((g) => g.target_date && g.target_date >= from && g.target_date <= to)
      .map<CalendarItem>((g) => ({
        key: `goal:${g.id}`,
        kind: "goal",
        sourceId: g.id,
        date: g.target_date!,
        time: null,
        endTime: null,
        title: `Goal: ${g.name}`,
        href: `/goals/${g.id}`,
      })),
    ...milestones
      .filter((m) => !m.completed_at && m.due_date && m.due_date >= from && m.due_date <= to)
      .map<CalendarItem>((m) => ({
        key: `milestone:${m.id}`,
        kind: "milestone",
        sourceId: m.id,
        date: m.due_date!,
        time: null,
        endTime: null,
        title: m.title,
        href: `/goals/${m.goal_id}`,
      })),
    ...documents.map<CalendarItem>((d) => ({
      key: `document:${d.id}`,
      kind: "document",
      sourceId: d.id,
      date: d.expiry_date!,
      time: null,
      endTime: null,
      title: d.is_sensitive ? "Sensitive document expires" : `${d.name} expires`,
      href: `/documents/${d.id}`,
    })),
    // Birthdays from dates of birth, and annual or one-off family dates.
    ...family
      .filter((m) => m.date_of_birth)
      .flatMap((m) =>
        occurrencesBetween(m.date_of_birth!, "yearly", 1, from, to).map<CalendarItem>((date) => ({
          key: `birthday:${m.id}:${date}`,
          kind: "family",
          sourceId: m.id,
          date,
          time: null,
          endTime: null,
          title: `${m.preferred_name ?? m.full_name}'s birthday`,
          href: `/family/${m.id}`,
        })),
      ),
    ...familyDates.flatMap((d) =>
      (d.is_annual ? occurrencesBetween(d.on_date, "yearly", 1, from, to) : inRange(d.on_date) ? [d.on_date] : []).map<CalendarItem>((date) => ({
        key: `familydate:${d.id}:${date}`,
        kind: "family",
        sourceId: d.id,
        date,
        time: null,
        endTime: null,
        title: d.family_member_id && familyName.get(d.family_member_id) ? `${d.title} · ${familyName.get(d.family_member_id)}` : d.title,
        href: d.family_member_id ? `/family/${d.family_member_id}` : "/family",
      })),
    ),
    // Vehicle service and renewal dates; warranty end dates.
    ...assets.flatMap((a) =>
      (
        [
          ["Service due", a.next_service_date],
          ["Insurance renewal", a.insurance_renewal_date],
          ["Registration renewal", a.registration_renewal_date],
        ] as const
      )
        .filter(([, d]) => inRange(d))
        .map<CalendarItem>(([label, date]) => ({
          key: `asset:${a.id}:${label}`,
          kind: "asset",
          sourceId: a.id,
          date: date!,
          time: null,
          endTime: null,
          title: `${label}: ${a.name}`,
          href: `/${a.type === "vehicle" ? "vehicles" : "property"}/${a.id}`,
        })),
    ),
    ...assetItems
      .filter((i) => inRange(i.warranty_expires_on))
      .map<CalendarItem>((i) => {
        const a = assetById.get(i.asset_id);
        return {
          key: `warranty:${i.id}`,
          kind: "asset",
          sourceId: i.id,
          date: i.warranty_expires_on!,
          time: null,
          endTime: null,
          title: `${i.name} warranty ends`,
          href: a ? `/${a.type === "vehicle" ? "vehicles" : "property"}/${a.id}` : "/property",
        };
      }),
  ];
  return items;
}
