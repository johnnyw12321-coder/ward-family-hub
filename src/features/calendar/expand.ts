/**
 * Expands stored events, bills, tasks and goal deadlines into dated calendar
 * items for a date range. Pure and timezone-aware: recurring events repeat on
 * the household's local calendar (anchor + k * step from their first date)
 * at the same local wall-clock time.
 */
import {
  addDays,
  compareDates,
  diffDays,
  instantToCalendarDate,
  instantToLocalTime,
  localToInstant,
  type CalendarDate,
} from "@/lib/dates";
import { occurrencesBetween, type Frequency } from "@/lib/recurrence";

export type EventCategory =
  | "family"
  | "work"
  | "medical"
  | "financial"
  | "school"
  | "birthday"
  | "anniversary"
  | "home_maintenance"
  | "personal"
  | "other";

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  family: "Family",
  work: "Work",
  medical: "Medical",
  financial: "Financial",
  school: "School",
  birthday: "Birthday",
  anniversary: "Anniversary",
  home_maintenance: "Home maintenance",
  personal: "Personal",
  other: "Other",
};

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  start_date: CalendarDate;
  recurrence_frequency: Frequency | null;
  recurrence_interval: number;
  recurrence_until: CalendarDate | null;
  reminder_minutes: number[];
  is_completed: boolean;
  participants: string[];
};

export type CalendarItem = {
  key: string;
  kind: "event" | "bill" | "income" | "task" | "goal" | "milestone" | "document";
  sourceId: string;
  date: CalendarDate; // local day this item appears on
  /** Local start time for timed events, "HH:mm". */
  time: string | null;
  endTime: string | null;
  title: string;
  href: string;
  category?: EventCategory;
  completed?: boolean;
  /** For multi-day all-day events: 1-based day index and total days. */
  span?: { day: number; of: number };
  participants?: string[];
  location?: string | null;
};

const MAX_SPAN_DAYS = 31;

export function expandEvents(
  events: EventRow[],
  from: CalendarDate,
  to: CalendarDate,
  timezone: string,
  completions: Set<string> = new Set(),
): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const e of events) {
    const firstDate = e.start_date;
    const lastDate = instantToCalendarDate(e.ends_at, timezone);
    const spanDays = Math.min(MAX_SPAN_DAYS, Math.max(1, diffDays(lastDate, firstDate) + 1));
    const startTime = e.all_day ? null : instantToLocalTime(e.starts_at, timezone);
    const endTime = e.all_day ? null : instantToLocalTime(e.ends_at, timezone);

    // Occurrence start dates whose span could touch [from, to].
    const windowStart = addDays(from, -(spanDays - 1));
    const starts = e.recurrence_frequency
      ? occurrencesBetween(firstDate, e.recurrence_frequency, e.recurrence_interval, windowStart, to, e.recurrence_until)
      : compareDates(firstDate, to) <= 0 && compareDates(addDays(firstDate, spanDays - 1), from) >= 0
        ? [firstDate]
        : [];

    for (const occ of starts) {
      const completed = e.recurrence_frequency ? completions.has(`${e.id}:${occ}`) : e.is_completed;
      const days = e.all_day ? spanDays : 1;
      for (let d = 0; d < days; d++) {
        const date = addDays(occ, d);
        if (compareDates(date, from) < 0 || compareDates(date, to) > 0) continue;
        out.push({
          key: `event:${e.id}:${occ}:${d}`,
          kind: "event",
          sourceId: e.id,
          date,
          time: startTime,
          endTime: spanDays > 1 && !e.all_day ? null : endTime,
          title: e.title,
          href: `/calendar/events/${e.id}?date=${occ}`,
          category: e.category,
          completed,
          span: days > 1 ? { day: d + 1, of: days } : undefined,
          participants: e.participants,
          location: e.location,
        });
      }
    }
  }
  return out;
}

/** Instants for one occurrence of an event (same local wall-clock times). */
export function occurrenceInstants(e: Pick<EventRow, "starts_at" | "ends_at" | "start_date" | "all_day">, occurrenceDate: CalendarDate, timezone: string) {
  const shift = diffDays(occurrenceDate, e.start_date);
  const startDate = addDays(e.start_date, shift);
  const endDate = addDays(instantToCalendarDate(e.ends_at, timezone), shift);
  if (e.all_day) return { startDate, endDate, start: null, end: null };
  return {
    startDate,
    endDate,
    start: localToInstant(startDate, instantToLocalTime(e.starts_at, timezone), timezone),
    end: localToInstant(endDate, instantToLocalTime(e.ends_at, timezone), timezone),
  };
}

export type BillLike = {
  id: string;
  name: string;
  direction: "bill" | "income";
  anchor_date: CalendarDate;
  next_due_date: CalendarDate;
  end_date: CalendarDate | null;
  frequency: Frequency;
  interval_count: number;
  is_active: boolean;
};

/** Outstanding and upcoming due dates (never past, settled occurrences). */
export function expandBills(items: BillLike[], from: CalendarDate, to: CalendarDate): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const b of items) {
    if (!b.is_active) continue;
    const start = compareDates(b.next_due_date, from) > 0 ? b.next_due_date : from;
    const dates = occurrencesBetween(b.anchor_date, b.frequency, b.interval_count, start, to, b.end_date);
    // The current outstanding due date always shows, even if before the window start is clipped.
    if (compareDates(b.next_due_date, from) >= 0 && compareDates(b.next_due_date, to) <= 0 && !dates.includes(b.next_due_date)) {
      dates.unshift(b.next_due_date);
    }
    for (const date of dates) {
      out.push({
        key: `${b.direction}:${b.id}:${date}`,
        kind: b.direction === "bill" ? "bill" : "income",
        sourceId: b.id,
        date,
        time: null,
        endTime: null,
        title: b.name,
        href: `/finances/bills/${b.id}`,
      });
    }
  }
  return out;
}

export function sortItems(items: CalendarItem[]): CalendarItem[] {
  const order: Record<CalendarItem["kind"], number> = { event: 1, bill: 2, income: 3, task: 4, goal: 5, milestone: 6, document: 7 };
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      // all-day before timed, then by time
      (a.time === null ? -1 : 0) - (b.time === null ? -1 : 0) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      order[a.kind] - order[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

export function groupByDate(items: CalendarItem[]): Map<CalendarDate, CalendarItem[]> {
  const map = new Map<CalendarDate, CalendarItem[]>();
  for (const item of sortItems(items)) {
    const list = map.get(item.date) ?? [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}
