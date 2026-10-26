/**
 * Which item a notification is a reminder for, and how its reminder can be
 * adjusted. Notifications are keyed "<source>:<item id>:…" (see the
 * generators in supabase/migrations), so the item is read from that key.
 * Settings are shared by the household (public.reminder_settings).
 */
export const REMINDER_SOURCES = [
  "bill",
  "task",
  "event",
  "goal",
  "milestone",
  "budget",
  "document",
  "vehicle",
  "maintenance",
  "warranty",
  "family",
] as const;
export type ReminderSource = (typeof REMINDER_SOURCES)[number];

export type LeadOption = { value: number | null; label: string };

type SourceInfo = {
  noun: string;
  /** Timing choices; null when the reminder isn't date-based (budgets). */
  leads: LeadOption[] | null;
  /** The lead used when nothing is set (for sources whose timing lives here). */
  defaultLead: number | null;
};

const days = (n: number) => (n === 0 ? "On the day" : n === 1 ? "1 day before" : n === 7 ? "1 week before" : n === 14 ? "2 weeks before" : `${n} days before`);
const opts = (values: number[]): LeadOption[] => values.map((v) => ({ value: v, label: days(v) }));

export const REMINDER_INFO: Record<ReminderSource, SourceInfo> = {
  bill: { noun: "bill", leads: opts([0, 1, 3, 7, 14]), defaultLead: 3 },
  task: { noun: "task", leads: opts([0, 1, 3, 7]), defaultLead: 0 },
  event: { noun: "event", leads: opts([0, 1, 2, 7]), defaultLead: 1 },
  goal: { noun: "goal", leads: opts([3, 7, 14, 30]), defaultLead: 14 },
  milestone: { noun: "milestone", leads: [{ value: null, label: "Only when overdue" }, ...opts([0, 1, 3, 7])], defaultLead: null },
  budget: { noun: "budget", leads: null, defaultLead: null },
  document: { noun: "document", leads: [...opts([7, 14, 30]), { value: 60, label: "2 months before" }], defaultLead: 30 },
  vehicle: { noun: "vehicle", leads: opts([7, 14, 30, 60]), defaultLead: 30 },
  maintenance: { noun: "maintenance", leads: opts([3, 7, 14, 30]), defaultLead: 14 },
  warranty: { noun: "warranty", leads: opts([7, 14, 30, 60]), defaultLead: 30 },
  family: { noun: "date", leads: opts([0, 1, 3, 7, 14]), defaultLead: 7 },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The item behind a notification. For budgets the key holds the month's
 * allocation id; the server maps it to the category the setting belongs to.
 */
export function reminderKey(dedupeKey: string): { source: ReminderSource; keyId: string } | null {
  const [source, id] = dedupeKey.split(":");
  if (!(REMINDER_SOURCES as readonly string[]).includes(source) || !id || !UUID.test(id)) return null;
  return { source: source as ReminderSource, keyId: id };
}

export type ReminderState = {
  source: ReminderSource;
  /** The item the setting belongs to (a category for budgets). */
  itemId: string;
  /** Effective lead in days, or null for "only when overdue" / not date-based. */
  leadDays: number | null;
  muted: boolean;
  snoozedUntil: string | null;
};

/** Snooze choices as days from today. */
export const SNOOZE_OPTIONS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
] as const;
