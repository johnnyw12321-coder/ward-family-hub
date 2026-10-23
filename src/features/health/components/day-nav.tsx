import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { addDays, dayHeading, type CalendarDate } from "@/lib/dates";

export function dayLabel(date: CalendarDate, today: CalendarDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return dayHeading(date);
}

/** Previous / next day links for a page that shows one day (?date=YYYY-MM-DD). */
export function DayNav({ date, today, basePath }: { date: CalendarDate; today: CalendarDate; basePath: string }) {
  const href = (d: CalendarDate) => (d === today ? basePath : `${basePath}?date=${d}`);
  const isToday = date >= today;
  const btn = "flex size-11 items-center justify-center rounded-full transition-colors hover:bg-muted";
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-card px-1.5 py-1 shadow-card ring-1 ring-border/80">
      <Link href={href(addDays(date, -1))} className={btn} aria-label="Previous day">
        <ChevronLeftIcon className="size-5" aria-hidden />
      </Link>
      <div className="text-center">
        <div className="text-sm font-semibold">{dayLabel(date, today)}</div>
        {date !== today ? (
          <Link href={basePath} className="text-xs font-medium text-primary">
            Back to today
          </Link>
        ) : (
          <div className="text-xs text-muted-foreground">{dayHeading(date)}</div>
        )}
      </div>
      {isToday ? (
        <span className={cn(btn, "pointer-events-none opacity-30")} aria-hidden>
          <ChevronRightIcon className="size-5" />
        </span>
      ) : (
        <Link href={href(addDays(date, 1))} className={btn} aria-label="Next day">
          <ChevronRightIcon className="size-5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
