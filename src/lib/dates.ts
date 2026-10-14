/**
 * Date utilities.
 *
 * Two kinds of values flow through the app:
 *   - Instants (timestamptz) — ISO strings in UTC, displayed in the household
 *     timezone.
 *   - Calendar dates ("YYYY-MM-DD") — due dates, budget months, local
 *     transaction dates. These have no timezone and are manipulated as plain
 *     year/month/day values via UTC arithmetic, never with local Date parsing.
 *
 * Display format is DD/MM/YYYY (Trinidad and Tobago convention).
 */
import { TZDate } from "@date-fns/tz";

export const DEFAULT_TIMEZONE = "America/Port_of_Spain";
export const DISPLAY_LOCALE = "en-GB"; // DD/MM/YYYY ordering

export type CalendarDate = string; // YYYY-MM-DD

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarDate(value: string): value is CalendarDate {
  const m = value.match(DATE_RE);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parts(date: CalendarDate): [number, number, number] {
  const m = date.match(DATE_RE);
  if (!m) throw new RangeError(`Invalid calendar date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUtc(dt: Date): CalendarDate {
  return dt.toISOString().slice(0, 10);
}

function toUtc(date: CalendarDate): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const dt = toUtc(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

/** Add months, clamping to the last day of the target month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const [y, m, d] = parts(date);
  const targetIndex = y * 12 + (m - 1) + months;
  const ty = Math.floor(targetIndex / 12);
  const tm = targetIndex - ty * 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(ty, tm, Math.min(d, lastDay))));
}

export function addYears(date: CalendarDate, years: number): CalendarDate {
  return addMonths(date, years * 12);
}

export function diffDays(later: CalendarDate, earlier: CalendarDate): number {
  return Math.round((toUtc(later).getTime() - toUtc(earlier).getTime()) / 86_400_000);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthStart(date: CalendarDate): CalendarDate {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: CalendarDate): CalendarDate {
  return addDays(addMonths(monthStart(date), 1), -1);
}

export function yearStart(date: CalendarDate): CalendarDate {
  return `${date.slice(0, 4)}-01-01`;
}

export function yearEnd(date: CalendarDate): CalendarDate {
  return `${date.slice(0, 4)}-12-31`;
}

/** Today's calendar date in the given timezone. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): CalendarDate {
  return instantToCalendarDate(now, timeZone);
}

export function instantToCalendarDate(instant: Date | string, timeZone: string = DEFAULT_TIMEZONE): CalendarDate {
  const dt = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

/** Local wall-clock time "HH:mm" for an instant in the timezone. */
export function instantToLocalTime(instant: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const dt = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dt);
}

/** Convert a local date + time in the household timezone to a UTC ISO instant. */
export function localToInstant(date: CalendarDate, time: string = "12:00", timeZone: string = DEFAULT_TIMEZONE): string {
  const [y, m, d] = parts(date);
  const tm = time.match(/^(\d{2}):(\d{2})$/);
  if (!tm) throw new RangeError(`Invalid time: ${time}`);
  const local = new TZDate(y, m - 1, d, Number(tm[1]), Number(tm[2]), 0, timeZone);
  return new Date(local.getTime()).toISOString();
}

/** DD/MM/YYYY */
export function formatDate(date: CalendarDate | null | undefined): string {
  if (!date) return "";
  const [y, m, d] = parts(date);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** DD/MM/YYYY, HH:mm in the household timezone */
export function formatInstant(instant: string | Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return `${formatDate(instantToCalendarDate(instant, timeZone))}, ${instantToLocalTime(instant, timeZone)}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthLabel(date: CalendarDate, style: "long" | "short" = "long"): string {
  const [y, m] = parts(date);
  return `${(style === "long" ? MONTHS : MONTHS_SHORT)[m - 1]} ${y}`;
}

export function shortMonth(date: CalendarDate): string {
  return MONTHS_SHORT[parts(date)[1] - 1];
}

export function weekday(date: CalendarDate): number {
  return toUtc(date).getUTCDay();
}

export function weekdayShort(date: CalendarDate): string {
  return WEEKDAYS_SHORT[weekday(date)];
}

/** "Today", "Tomorrow", "Yesterday", "in 5 days", "3 days ago", or the date. */
export function relativeDay(date: CalendarDate, today: CalendarDate): string {
  const diff = diffDays(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff <= 14) return `in ${diff} days`;
  if (diff < -1 && diff >= -14) return `${-diff} days ago`;
  return formatDate(date);
}

/** Friendly day header like "Wed 14 Oct". */
export function dayHeading(date: CalendarDate): string {
  const [, m, d] = parts(date);
  return `${weekdayShort(date)} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** Inclusive list of month starts between two dates. */
export function monthsBetween(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const out: CalendarDate[] = [];
  let cur = monthStart(from);
  const last = monthStart(to);
  while (cur <= last) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Start of the week (Monday) containing the date. */
export function weekStart(date: CalendarDate): CalendarDate {
  const day = weekday(date); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}
