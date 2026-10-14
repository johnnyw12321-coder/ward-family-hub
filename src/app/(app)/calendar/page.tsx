import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { CalendarItemRow, itemDot } from "@/features/calendar/components/calendar-items";
import { NewEventButton } from "@/features/calendar/components/event-form";
import { groupByDate, type CalendarItem } from "@/features/calendar/expand";
import { getAboutOptions } from "@/features/calendar/about-options";
import { getCalendarItems } from "@/features/calendar/queries";
import { requireHousehold } from "@/lib/auth/context";
import {
  addDays,
  addMonths,
  dayHeading,
  formatDate,
  isCalendarDate,
  monthEnd,
  monthLabel,
  monthStart,
  weekStart,
  type CalendarDate,
} from "@/lib/dates";

export const metadata: Metadata = { title: "Calendar" };

const VIEWS = ["month", "week", "day", "agenda"] as const;
type View = (typeof VIEWS)[number];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Calendar" />
          <CardSkeleton lines={8} />
        </>
      }
    >
      <CalendarView searchParams={searchParams} />
    </Suspense>
  );
}

function range(view: View, date: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  switch (view) {
    case "month": {
      const from = weekStart(monthStart(date));
      return { from, to: addDays(weekStart(monthEnd(date)), 6) };
    }
    case "week": {
      const from = weekStart(date);
      return { from, to: addDays(from, 6) };
    }
    case "day":
      return { from: date, to: date };
    default:
      return { from: date, to: addDays(date, 59) };
  }
}

function step(view: View, date: CalendarDate, dir: 1 | -1): CalendarDate {
  if (view === "month") return addMonths(monthStart(date), dir);
  if (view === "week") return addDays(date, 7 * dir);
  if (view === "day") return addDays(date, dir);
  return addDays(date, 30 * dir);
}

function title(view: View, date: CalendarDate, from: CalendarDate, to: CalendarDate): string {
  if (view === "month") return monthLabel(date);
  if (view === "day") return `${dayHeading(date)} ${date.slice(0, 4)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

async function CalendarView({ searchParams }: { searchParams: PageProps<"/calendar">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireHousehold();
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const date: CalendarDate = typeof sp.date === "string" && isCalendarDate(sp.date) ? sp.date : ctx.today;
  const { from, to } = range(view, date);
  const [items, about] = await Promise.all([getCalendarItems(ctx, from, to), getAboutOptions(ctx)]);
  const byDate = groupByDate(items);
  const names = Object.fromEntries(ctx.members.map((m) => [m.user_id, m.display_name]));
  const href = (v: View, d: CalendarDate) => `/calendar?view=${v}&date=${d}`;

  const dayList = (days: CalendarDate[], showEmpty: boolean) => {
    const rendered = days
      .map((d) => ({ d, list: byDate.get(d) ?? [] }))
      .filter(({ list }) => showEmpty || list.length);
    if (!rendered.length) {
      return (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
          Nothing scheduled{view === "agenda" ? " in the next 60 days" : ""}.
        </p>
      );
    }
    return (
      <div className="space-y-4">
        {rendered.map(({ d, list }) => (
          <section key={d} aria-label={formatDate(d)}>
            <h2 className={cn("mb-1.5 px-1 text-xs font-semibold", d === ctx.today ? "text-primary" : "text-muted-foreground")}>
              {d === ctx.today ? "Today · " : ""}
              {dayHeading(d)}
            </h2>
            {list.length ? (
              <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
                {list.map((item) => (
                  <CalendarItemRow key={item.key} item={item} names={names} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">Free</p>
            )}
          </section>
        ))}
      </div>
    );
  };

  const days: CalendarDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        actions={ctx.canWrite ? <NewEventButton members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))} about={about} defaultDate={date} /> : null}
      />

      <nav aria-label="Calendar view" className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={href(v, date)}
            aria-current={v === view ? "page" : undefined}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg text-sm font-medium capitalize",
              v === view ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href={href(view, step(view, date, -1))} aria-label="Previous">
            <ChevronLeftIcon />
          </Link>
        </Button>
        <div className="text-center">
          <div className="font-semibold">{title(view, date, from, to)}</div>
          {date !== ctx.today ? (
            <Link href={href(view, ctx.today)} className="text-xs text-primary">
              Jump to today
            </Link>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="icon">
          <Link href={href(view, step(view, date, 1))} aria-label="Next">
            <ChevronRightIcon />
          </Link>
        </Button>
      </div>

      {view === "month" ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const list: CalendarItem[] = byDate.get(d) ?? [];
                const inMonth = d.slice(0, 7) === date.slice(0, 7);
                const selected = d === date;
                return (
                  <Link
                    key={d}
                    href={href("month", d)}
                    aria-label={`${formatDate(d)}, ${list.length} item${list.length === 1 ? "" : "s"}`}
                    aria-current={selected ? "date" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center gap-1 border-r border-b p-1 transition-colors last:border-r-0 hover:bg-muted/60 lg:min-h-24 lg:items-stretch",
                      !inMonth && "bg-muted/30 text-muted-foreground/60",
                      selected && "bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-sm tabular lg:self-end",
                        d === ctx.today && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <span className="flex flex-wrap justify-center gap-0.5 lg:hidden" aria-hidden>
                      {list.slice(0, 4).map((i) => (
                        <span key={i.key} className={cn("size-1.5 rounded-full", itemDot(i))} />
                      ))}
                    </span>
                    <span className="hidden space-y-0.5 lg:block">
                      {list.slice(0, 3).map((i) => (
                        <span key={i.key} className="flex items-center gap-1 truncate text-[11px] leading-tight">
                          <span className={cn("size-1.5 shrink-0 rounded-full", itemDot(i))} aria-hidden />
                          <span className="truncate">{i.time ? `${i.time} ` : ""}{i.title}</span>
                        </span>
                      ))}
                      {list.length > 3 ? <span className="block text-[11px] text-muted-foreground">+{list.length - 3} more</span> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          {dayList([date], true)}
        </>
      ) : view === "week" || view === "day" ? (
        dayList(days, true)
      ) : (
        dayList(days, false)
      )}

      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <CalendarDaysIcon className="size-3.5" aria-hidden /> Bills, tasks and goal deadlines appear alongside events. Times are in{" "}
        {ctx.household.timezone.replace(/_/g, " ")}.
      </p>
    </div>
  );
}
