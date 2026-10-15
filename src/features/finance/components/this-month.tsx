import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircleIcon, ArrowRightIcon, CheckCircle2Icon, CircleIcon, SkipForwardIcon } from "lucide-react";
import { cn } from "cn";
import { memberColorClass } from "@/components/shared/member-color";
import { Money } from "@/components/shared/money";
import { SectionHeading } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getAccounts, getBudgetProgress, getPaymentsDueBetween, getRecurringItems } from "@/features/finance/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import { addMonths, diffDays, formatDate, monthEnd, monthLabel, monthStart, type CalendarDate } from "@/lib/dates";
import { budgetStatus, monthElapsedPercent, type AccountType } from "@/lib/finance/calculations";
import { minorToInput } from "@/lib/money";
import { monthEntries, type MonthEntry, type MonthGroup } from "../month";
import { BudgetBar } from "./budget-bar";
import { MonthTabs } from "./month-tabs";
import { SettleQuickButton } from "./recurring-forms";

type BudgetRows = Awaited<ReturnType<typeof getBudgetProgress>>;
type Person = { name: string; color: string };
type RowProps = {
  today: CalendarDate;
  accounts: { id: string; name: string; type: AccountType }[];
  canWrite: boolean;
  people: Record<string, Person>;
};

/**
 * Bills, expected income and budget for this month and next, in one place,
 * each bill with who's responsible and a one-tap "Pay". Next month is there
 * because pay days don't line up with months: bills for next month are often
 * paid from this month's salary. Used on Home and the Finances overview.
 */
export async function ThisMonth({ ctx }: { ctx: HouseholdContext }) {
  const month = monthStart(ctx.today);
  const next = addMonths(month, 1);
  const [items, payments, budget, nextBudget, accounts] = await Promise.all([
    getRecurringItems(ctx, { includeInactive: true }),
    getPaymentsDueBetween(ctx, month, monthEnd(next)),
    getBudgetProgress(ctx, month),
    getBudgetProgress(ctx, next),
    getAccounts(ctx),
  ]);
  const own = items.filter((i) => i.currency === ctx.household.base_currency);
  const now = monthEntries(own, payments, month, ctx.today);
  const later = monthEntries(own, payments, next, ctx.today);
  const rowProps: RowProps = {
    today: ctx.today,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    canWrite: ctx.canWrite,
    people: Object.fromEntries(ctx.members.map((m) => [m.user_id, { name: m.display_name, color: m.color }])),
  };
  const toPay = (g: MonthGroup) => g.entries.filter((e) => e.status === "due" || e.status === "overdue").length;
  return (
    <section aria-label="Bills and budget">
      <SectionHeading title="Bills & budget" />
      <MonthTabs
        label="Month"
        tabs={[
          {
            key: "this",
            label: monthLabel(month).split(" ")[0],
            badge: toPay(now.bills) ? String(toPay(now.bills)) : undefined,
            content: <MonthPanel {...now} budget={budget} month={month} current {...rowProps} />,
          },
          {
            key: "next",
            label: monthLabel(next).split(" ")[0],
            badge: toPay(later.bills) ? String(toPay(later.bills)) : undefined,
            content: <MonthPanel {...later} budget={nextBudget} month={next} current={false} {...rowProps} />,
          },
        ]}
      />
    </section>
  );
}

export function MonthPanel({
  bills,
  income,
  budget,
  month,
  current,
  ...rowProps
}: { bills: MonthGroup; income: MonthGroup; budget: BudgetRows; month: CalendarDate; current: boolean } & RowProps) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="space-y-3">
        <BillsCard group={bills} month={month} {...rowProps} />
        {income.entries.length ? <IncomeCard group={income} month={month} {...rowProps} /> : null}
      </div>
      <BudgetCard budget={budget} month={month} today={rowProps.today} current={current} />
    </div>
  );
}

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

function Initial({ person, className }: { person: Person; className?: string }) {
  return (
    <span
      className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", memberColorClass(person.color), className)}
      aria-hidden
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Still to pay, per responsible person, so each of you knows your share. */
function ShareByPerson({ group, people }: { group: MonthGroup; people: Record<string, Person> }) {
  const open = group.entries.filter((e) => e.status === "due" || e.status === "overdue");
  if (!open.length || !group.entries.some((e) => e.item.person_user_id)) return null;
  const totals = new Map<string, number>();
  for (const e of open) {
    const key = e.item.person_user_id && people[e.item.person_user_id] ? e.item.person_user_id : "";
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Still to pay by person">
      {[...totals].map(([id, amount]) => (
        <li key={id || "none"} className="flex items-center gap-1.5">
          {id ? <Initial person={people[id]} /> : null}
          <span>
            {id ? people[id].name : "Not assigned"} <Money minor={amount} trimZeroCents className="font-medium text-foreground" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function BillsCard({ group, month, ...rowProps }: { group: MonthGroup; month: CalendarDate } & RowProps) {
  return (
    <Card
      title={`Bills · ${monthLabel(month).split(" ")[0]}`}
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
            <ProgressLine value={group.settled} total={group.total} label={`Share of ${monthLabel(month)} bills paid`} />
            <ShareByPerson group={group} people={rowProps.people} />
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
            <EntryRow key={`${e.item.id}-${e.dueDate}`} entry={e} month={month} {...rowProps} />
          ))}
        </ul>
      ) : (
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          No bills due in {monthLabel(month)}.{" "}
          <Link href="/finances/bills" className="font-medium text-primary">
            Add your regular bills
          </Link>{" "}
          to see them here.
        </p>
      )}
    </Card>
  );
}

function IncomeCard({ group, month, ...rowProps }: { group: MonthGroup; month: CalendarDate } & RowProps) {
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
          <EntryRow key={`${e.item.id}-${e.dueDate}`} entry={e} month={month} {...rowProps} />
        ))}
      </ul>
    </Card>
  );
}

/** DD/MM within the month shown; carried-over dates keep their year. */
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
  // A later occurrence can only be settled after the earlier one.
  if (!e.isNext && e.item.is_active && e.item.next_due_date < month) return `Due ${on} · after the ${shortDate(e.item.next_due_date, month)} one`;
  if (days === 0) return "Due today";
  if (days === 1) return `Due tomorrow · ${on}`;
  return `Due in ${days} days · ${on}`;
}

function EntryRow({ entry: e, month, today, accounts, canWrite, people }: { entry: MonthEntry; month: CalendarDate } & RowProps) {
  const income = e.item.direction === "income";
  const settled = e.status === "paid" || e.status === "skipped";
  const Icon = e.status === "paid" ? CheckCircle2Icon : e.status === "skipped" ? SkipForwardIcon : e.status === "overdue" ? AlertCircleIcon : CircleIcon;
  const canSettle = canWrite && e.isNext && e.item.is_active && !settled;
  const person = e.item.person_user_id ? people[e.item.person_user_id] : undefined;
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
        <span className={cn("flex items-center gap-1.5 text-sm font-medium", settled && "text-muted-foreground")}>
          <span className="truncate">{e.item.name}</span>
          {person ? <Initial person={person} className="size-4 text-[9px]" /> : null}
          {person ? <span className="sr-only">, {person.name}</span> : null}
        </span>
        <span className={cn("block truncate text-xs", e.status === "overdue" && !income ? "font-medium text-destructive" : "text-muted-foreground")}>
          {statusText(e, today, month)}
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

function BudgetCard({ budget, month, today, current }: { budget: BudgetRows; month: CalendarDate; today: CalendarDate; current: boolean }) {
  const lines = budget.filter((b) => b.allocation_id);
  const unbudgeted = budget.find((b) => !b.allocation_id)?.spent_minor ?? 0;
  const totals = lines.reduce((acc, l) => ({ available: acc.available + l.allocated_minor + l.carried_in_minor, spent: acc.spent + l.spent_minor }), {
    available: 0,
    spent: 0,
  });
  const left = totals.available - totals.spent;
  const pace = current ? monthElapsedPercent(today, month) : undefined;
  const flagged = lines.filter((l) => budgetStatus(l.allocated_minor, l.carried_in_minor, l.spent_minor).level !== "ok").length;
  const href = current ? "/finances/budgets" : `/finances/budgets?month=${month.slice(0, 7)}`;
  return (
    <Card
      title={`Budget · ${monthLabel(month).split(" ")[0]}`}
      link={{ href, label: lines.length ? "Edit budget" : "Set budget" }}
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
            <ProgressLine value={totals.spent} total={totals.available} tone={left < 0 ? "destructive" : "primary"} label={`Share of ${monthLabel(month)} budget spent`} />
            <p className="text-xs text-muted-foreground">
              {pace !== undefined ? `${Math.round(pace)}% of the month gone` : `Starts ${formatDate(month)}`}
              {flagged ? ` · ${flagged === 1 ? "1 line needs" : `${flagged} lines need`} attention` : ""}
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
          <p className="text-sm text-muted-foreground">
            No budget for {monthLabel(month)} yet.{" "}
            {current ? "Set amounts for groceries, fuel, fun and the rest to track them here." : "Copy this month's budget forward or set new amounts."}
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href={href}>Set the {monthLabel(month).split(" ")[0]} budget</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
