import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircleIcon, ArrowRightIcon, CheckCircle2Icon, CircleIcon, SkipForwardIcon } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/shared/money";
import { SectionHeading } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getAccounts, getBudgetProgress, getPaymentsDueBetween, getRecurringItems } from "@/features/finance/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import { diffDays, formatDate, monthEnd, monthLabel, monthStart, type CalendarDate } from "@/lib/dates";
import { budgetStatus, monthElapsedPercent, type AccountType } from "@/lib/finance/calculations";
import { minorToInput } from "@/lib/money";
import { monthEntries, type MonthEntry, type MonthGroup } from "../month";
import { BudgetBar } from "./budget-bar";
import { SettleQuickButton } from "./recurring-forms";

/**
 * Everything planned for the current month in one place: each bill and
 * expected income with its status (and a one-tap "Pay"), and every budget line
 * with what's been spent. Used on Home and the Finances overview.
 */
export async function ThisMonth({ ctx }: { ctx: HouseholdContext }) {
  const month = monthStart(ctx.today);
  const end = monthEnd(month);
  const [items, payments, budget, accounts] = await Promise.all([
    getRecurringItems(ctx, { includeInactive: true }),
    getPaymentsDueBetween(ctx, month, end),
    getBudgetProgress(ctx, month),
    getAccounts(ctx),
  ]);
  const { bills, income } = monthEntries(
    items.filter((i) => i.currency === ctx.household.base_currency),
    payments,
    month,
    ctx.today,
  );
  return (
    <ThisMonthView
      bills={bills}
      income={income}
      budget={budget}
      month={month}
      today={ctx.today}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
      canWrite={ctx.canWrite}
    />
  );
}

export function ThisMonthView({
  bills,
  income,
  budget,
  month,
  today,
  accounts,
  canWrite,
}: {
  bills: MonthGroup;
  income: MonthGroup;
  budget: Awaited<ReturnType<typeof getBudgetProgress>>;
  month: CalendarDate;
} & RowProps) {
  const rowProps = { today, accounts, canWrite };
  return (
    <section aria-label={`This month, ${monthLabel(month)}`}>
      <SectionHeading title={`This month · ${monthLabel(month)}`} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-3">
          <BillsCard group={bills} {...rowProps} />
          {income.entries.length ? <IncomeCard group={income} {...rowProps} /> : null}
        </div>
        <BudgetCard budget={budget} month={month} today={today} />
      </div>
    </section>
  );
}

type RowProps = { today: CalendarDate; accounts: { id: string; name: string; type: AccountType }[]; canWrite: boolean };

function Card({ title, summary, children, link }: { title: string; summary: ReactNode; children: ReactNode; link: { href: string; label: string } }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
      <div className="space-y-2 p-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">{title}</h3>
          <Link href={link.href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            {link.label} <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        </div>
        {summary}
      </div>
      {children}
    </div>
  );
}

function ProgressLine({ value, total, tone = "primary", label }: { value: number; total: number; tone?: "primary" | "destructive"; label: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className={cn("h-full rounded-full", tone === "destructive" ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
    </div>
  );
}

function BillsCard({ group, ...rowProps }: { group: MonthGroup } & RowProps) {
  return (
    <Card
      title="Bills"
      link={{ href: "/finances/bills", label: "All bills" }}
      summary={
        group.entries.length ? (
          <>
            <p className="text-sm text-muted-foreground">
              <Money minor={group.settled} trimZeroCents className="font-semibold text-foreground" /> paid of{" "}
              <Money minor={group.total} trimZeroCents /> ·{" "}
              {group.outstanding > 0 ? (
                <>
                  <Money minor={group.outstanding} trimZeroCents /> to go
                </>
              ) : (
                "all done"
              )}
            </p>
            <ProgressLine value={group.settled} total={group.total} label="Share of this month's bills paid" />
            {group.overdueCount ? (
              <p className="text-xs font-medium text-destructive">
                {group.overdueCount === 1 ? "1 bill is overdue" : `${group.overdueCount} bills are overdue`}
              </p>
            ) : null}
          </>
        ) : null
      }
    >
      {group.entries.length ? (
        <ul className="divide-y border-t">
          {group.entries.map((e) => (
            <EntryRow key={`${e.item.id}-${e.dueDate}`} entry={e} {...rowProps} />
          ))}
        </ul>
      ) : (
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          No bills due this month.{" "}
          <Link href="/finances/bills" className="font-medium text-primary">
            Add your regular bills
          </Link>{" "}
          to see them here.
        </p>
      )}
    </Card>
  );
}

function IncomeCard({ group, ...rowProps }: { group: MonthGroup } & RowProps) {
  return (
    <Card
      title="Income expected"
      link={{ href: "/finances/bills", label: "Manage" }}
      summary={
        <p className="text-sm text-muted-foreground">
          <Money minor={group.settled} trimZeroCents className="font-semibold text-foreground" /> received of{" "}
          <Money minor={group.total} trimZeroCents />
        </p>
      }
    >
      <ul className="divide-y border-t">
        {group.entries.map((e) => (
          <EntryRow key={`${e.item.id}-${e.dueDate}`} entry={e} {...rowProps} />
        ))}
      </ul>
    </Card>
  );
}

/** DD/MM — the year is implied by "this month" (overdue carry-overs keep it). */
function shortDate(date: CalendarDate, month: CalendarDate): string {
  return date < month ? formatDate(date) : formatDate(date).slice(0, 5);
}

function statusText(e: MonthEntry, today: CalendarDate, month: CalendarDate): string {
  const income = e.item.direction === "income";
  const on = shortDate(e.dueDate, month);
  if (e.status === "paid") return `${income ? "Received" : "Paid"} · was due ${on}`;
  if (e.status === "skipped") return `Skipped · ${on}`;
  const days = diffDays(e.dueDate, today);
  if (days < 0) return `${income ? "Not recorded" : "Overdue"} ${-days === 1 ? "1 day" : `${-days} days`} · ${on}`;
  if (days === 0) return "Due today";
  if (days === 1) return `Due tomorrow · ${on}`;
  return `Due in ${days} days · ${on}`;
}

function EntryRow({ entry: e, today, accounts, canWrite }: { entry: MonthEntry } & RowProps) {
  const income = e.item.direction === "income";
  const settled = e.status === "paid" || e.status === "skipped";
  const Icon = e.status === "paid" ? CheckCircle2Icon : e.status === "skipped" ? SkipForwardIcon : e.status === "overdue" ? AlertCircleIcon : CircleIcon;
  const canSettle = canWrite && e.isNext && e.item.is_active && !settled;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Icon
        className={cn(
          "size-5 shrink-0",
          e.status === "paid" ? "text-success" : e.status === "overdue" && !income ? "text-destructive" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <Link href={`/finances/bills/${e.item.id}`} className="min-w-0 flex-1 py-0.5">
        <span className={cn("block truncate text-sm font-medium", settled && "text-muted-foreground")}>{e.item.name}</span>
        <span className={cn("block truncate text-xs", e.status === "overdue" && !income ? "font-medium text-destructive" : "text-muted-foreground")}>
          {statusText(e, today, monthStart(today))}
        </span>
      </Link>
      <div className="shrink-0 text-right">
        <Money
          minor={e.status === "skipped" ? e.item.amount_minor : e.amount}
          trimZeroCents
          tone={income && !settled ? "income" : "plain"}
          className={cn("text-sm font-semibold", settled && "font-medium text-muted-foreground", e.status === "skipped" && "line-through")}
        />
        {e.item.is_variable_amount && !settled ? <div className="text-[11px] text-muted-foreground">about</div> : null}
      </div>
      {canSettle ? (
        <SettleQuickButton
          label={`${income ? "Mark received" : "Pay"}: ${e.item.name}`}
          recurringId={e.item.id}
          dueDate={e.dueDate}
          amount={minorToInput(e.item.amount_minor)}
          accountId={e.item.account_id ?? ""}
          accounts={accounts}
          today={today}
          currency={e.item.currency}
          canRecord={Boolean(e.item.category_id || e.item.liability_account_id)}
          direction={e.item.direction}
        />
      ) : null}
    </li>
  );
}

function BudgetCard({ budget, month, today }: { budget: Awaited<ReturnType<typeof getBudgetProgress>>; month: CalendarDate; today: CalendarDate }) {
  const lines = budget.filter((b) => b.allocation_id);
  const unbudgeted = budget.find((b) => !b.allocation_id)?.spent_minor ?? 0;
  const totals = lines.reduce((acc, l) => ({ available: acc.available + l.allocated_minor + l.carried_in_minor, spent: acc.spent + l.spent_minor }), {
    available: 0,
    spent: 0,
  });
  const left = totals.available - totals.spent;
  const pace = monthElapsedPercent(today, month);
  const flagged = lines.filter((l) => budgetStatus(l.allocated_minor, l.carried_in_minor, l.spent_minor).level !== "ok").length;
  return (
    <Card
      title="Budget"
      link={{ href: "/finances/budgets", label: lines.length ? "Edit budget" : "Set budget" }}
      summary={
        lines.length ? (
          <>
            <p className="text-sm text-muted-foreground">
              <Money minor={totals.spent} trimZeroCents className="font-semibold text-foreground" /> spent of{" "}
              <Money minor={totals.available} trimZeroCents /> ·{" "}
              <span className={cn(left < 0 && "font-medium text-destructive")}>
                <Money minor={Math.abs(left)} trimZeroCents /> {left < 0 ? "over" : "left"}
              </span>
            </p>
            <ProgressLine value={totals.spent} total={totals.available} tone={left < 0 ? "destructive" : "primary"} label="Share of this month's budget spent" />
            <p className="text-xs text-muted-foreground">
              {Math.round(pace)}% of the month gone{flagged ? ` · ${flagged === 1 ? "1 line needs" : `${flagged} lines need`} attention` : ""}
            </p>
          </>
        ) : null
      }
    >
      {lines.length ? (
        <div className="border-t px-4 py-1">
          {lines.map((b) => (
            <BudgetBar
              key={b.allocation_id}
              name={b.category_name}
              allocated={b.allocated_minor}
              carriedIn={b.carried_in_minor}
              spent={b.spent_minor}
              pacePercent={pace}
              compact
            />
          ))}
          {unbudgeted > 0 ? (
            <p className="flex justify-between gap-3 border-t py-2.5 text-xs text-muted-foreground">
              <span>Spent outside the budget</span>
              <Money minor={unbudgeted} trimZeroCents className="font-medium text-foreground" />
            </p>
          ) : null}
        </div>
      ) : (
        <div className="border-t px-4 py-4">
          <p className="text-sm text-muted-foreground">No budget for {monthLabel(month)} yet. Set amounts for groceries, fuel, fun and the rest to track them here.</p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/finances/budgets">Set this month&apos;s budget</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
