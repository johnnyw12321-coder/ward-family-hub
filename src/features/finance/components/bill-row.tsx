import Link from "next/link";
import { CalendarClockIcon, RepeatIcon, TrendingUpIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { formatDate, type CalendarDate } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";
import { dueLabel, dueState } from "../bills";
import type { RecurringItem } from "../types";

export function BillRow({ item, today }: { item: RecurringItem; today: CalendarDate }) {
  const state = dueState(item.next_due_date, today, item.reminder_days_before);
  const income = item.direction === "income";
  const Icon = income ? TrendingUpIcon : state === "overdue" ? CalendarClockIcon : RepeatIcon;
  return (
    <li>
      <Link
        href={`/finances/bills/${item.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            state === "overdue" && !income
              ? "bg-danger-soft text-destructive"
              : state === "due-today" || state === "due-soon"
                ? "bg-warning-soft text-warning"
                : income
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{item.name}</span>
            {item.autopay ? (
              <Badge variant="secondary" className="shrink-0">
                Autopay
              </Badge>
            ) : null}
          </div>
          <div
            className={cn(
              "truncate text-xs",
              state === "overdue" && !income ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {income && state === "overdue" ? "Expected — not yet recorded" : dueLabel(item.next_due_date, today)} ·{" "}
            {formatDate(item.next_due_date)} · {describeRecurrence(item.frequency, item.interval_count)}
          </div>
        </div>
        <div className="text-right">
          <Money minor={item.amount_minor} tone={income ? "income" : "plain"} className="font-semibold" />
          {item.is_variable_amount ? <div className="text-[11px] text-muted-foreground">varies</div> : null}
        </div>
      </Link>
    </li>
  );
}
