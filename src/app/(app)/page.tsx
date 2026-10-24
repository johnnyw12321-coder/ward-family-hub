import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon, CheckCircle2Icon, CircleIcon, ReceiptIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton, PageSkeleton } from "@/components/shared/skeletons";
import { FitText } from "@/components/shared/fit-text";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { ThisMonth } from "@/features/finance/components/this-month";
import { TransactionList } from "@/features/finance/components/transaction-list";
import {
  getAccounts,
  getBudgetProgress,
  getCategories,
  getRecurringItems,
  getSummary,
  getTransactions,
} from "@/features/finance/queries";
import { assetsNetWorthValue, getAssets } from "@/features/assets/queries";
import { CalendarItemRow } from "@/features/calendar/components/calendar-items";
import { sortItems } from "@/features/calendar/expand";
import { getCalendarItems } from "@/features/calendar/queries";
import { GoalCard } from "@/features/goals/components/goal-card";
import { goalProgress, goalProjection } from "@/features/goals/progress";
import { buildInputs, getContributions, getGoals, getMilestones } from "@/features/goals/queries";
import { getOpenTasks } from "@/features/tasks/queries";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { addMonths, formatDate, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { leftOver, percentChange, summariseBalances } from "@/lib/finance/calculations";
import { safeToSpend } from "@/lib/finance/forecast";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function Dashboard() {
  const ctx = await requireHousehold();
  const { today } = ctx;
  const month = monthStart(today);
  const lastMonth = addMonths(month, -1);
  const lastMonthSameDay = addMonths(today, -1);

  const [accounts, summary, lastSummary, budget, recurring, recent, categories, todayItems, openTasks, goals, assets] = await Promise.all([
    getAccounts(ctx),
    getSummary(ctx, month, monthEnd(month)),
    getSummary(ctx, lastMonth, lastMonthSameDay),
    getBudgetProgress(ctx, month),
    getRecurringItems(ctx),
    getTransactions(ctx, {}, { pageSize: 6 }),
    getCategories(ctx, { includeArchived: true }),
    getCalendarItems(ctx, today, today),
    getOpenTasks(ctx),
    getGoals(ctx),
    getAssets(ctx),
  ]);
  const activeGoals = goals.filter((g) => g.status === "in_progress").slice(0, 2);
  const [milestones, contributions] = await Promise.all([
    getMilestones(ctx, activeGoals.map((g) => g.id)),
    getContributions(ctx, activeGoals.map((g) => g.id)),
  ]);
  const goalInputs = buildInputs(activeGoals, new Map(accounts.map((a) => [a.id, a.balance_minor])), milestones, contributions);
  // Bills already have their own section; today's agenda shows everything else.
  const agenda = sortItems(todayItems.filter((i) => i.kind !== "bill" && i.kind !== "income"));
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < today);
  const names = Object.fromEntries(ctx.members.map((m) => [m.user_id, m.display_name]));

  const assetValue = assetsNetWorthValue(assets);
  const cardIds = new Set(accounts.filter((a) => a.type === "credit_card").map((a) => a.id));
  const forecast = safeToSpend(
    summariseBalances(accounts).availableCash,
    recurring.map((r) => ({ ...r, paidByCard: Boolean(r.account_id && cardIds.has(r.account_id)) })),
    today,
  );
  const balances = summariseBalances(accounts, assetValue);
  const net = leftOver(summary);
  const spendChange = percentChange(summary.expense_minor, lastSummary.expense_minor);
  const overdueBills = recurring.filter((r) => r.direction === "bill" && r.next_due_date < today);
  const budgetLines = budget.filter((b) => b.allocation_id);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: ctx.household.timezone }).format(new Date()));

  const setup = [
    { done: accounts.length > 0, label: "Add your bank, cash and credit card accounts", href: "/finances/accounts" },
    { done: recurring.length > 0, label: "Add recurring bills like the mortgage and utilities", href: "/finances/bills" },
    { done: budgetLines.length > 0, label: `Set a budget for ${monthLabel(month)}`, href: "/finances/budgets" },
    { done: recent.total > 0, label: "Record your first expense with the + button", href: "/finances/transactions" },
  ];
  const setupComplete = setup.every((s) => s.done);

  return (
    <div className="space-y-6 pt-2">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(today)}</p>
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
          {greeting(hour)}, {ctx.me.display_name}
        </h1>
      </div>

      {overdueBills.length > 0 ? (
        <Link
          href="/finances/bills"
          className="flex items-center justify-between gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20"
        >
          <span className="font-medium">
            {overdueBills.length === 1 ? "1 bill is overdue" : `${overdueBills.length} bills are overdue`}
          </span>
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      ) : null}

      <section aria-label={`${monthLabel(month)} at a glance`} className="rounded-3xl bg-primary p-5 text-primary-foreground shadow-float">
        <div className="text-sm text-primary-foreground/80">{monthLabel(month)} so far</div>
        <FitText className="mt-1 text-3xl font-semibold tracking-tight tabular">
          <Money minor={net} tone="plain" />
        </FitText>
        <div className="text-sm text-primary-foreground/80">{net >= 0 ? "left over" : "short"} this month</div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-primary-foreground/15 pt-4 text-sm">
          <div>
            <div className="text-primary-foreground/75">Income</div>
            <FitText className="font-semibold tabular">
              <Money minor={summary.income_minor} />
            </FitText>
          </div>
          <div>
            <div className="text-primary-foreground/75">Spending</div>
            <FitText className="font-semibold tabular">
              <Money minor={summary.expense_minor} />
            </FitText>
            {spendChange !== null ? (
              <div className="text-xs text-primary-foreground/75">
                {spendChange > 0 ? "▲" : spendChange < 0 ? "▼" : ""} {Math.abs(spendChange)}% vs same point last month
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-primary-foreground/75">Debts</div>
            <FitText className="font-semibold tabular">
              <Money minor={summary.loan_payment_minor} />
            </FitText>
          </div>
        </div>
        {summary.savings_transfer_minor > 0 ? (
          <p className="mt-3 text-xs text-primary-foreground/75">
            <Money minor={summary.savings_transfer_minor} /> moved to savings is still yours, so it isn&apos;t taken off.
          </p>
        ) : null}
      </section>

      <Suspense fallback={<CardSkeleton lines={6} />}>
        <ThisMonth ctx={ctx} />
      </Suspense>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available cash" value={<Money minor={balances.availableCash} />} hint="Cash + chequing" href="/finances/accounts" />
        <StatCard label="Savings" value={<Money minor={balances.savings} />} href="/finances/accounts" />
        <StatCard label="Owed" value={<Money minor={balances.totalLiabilities} />} hint="Cards and loans" href="/finances/debts" />
        <StatCard label="Net worth" value={<Money minor={balances.netWorth} />} hint={assetValue ? "Incl. home & vehicles" : "Accounts only"} href="/reports" />
      </div>

      {forecast ? (
        <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Safe to spend until {formatDate(forecast.payday)}</h2>
              <p className="text-xs text-muted-foreground">
                Cash and chequing, minus {forecast.bills.length} bill{forecast.bills.length === 1 ? "" : "s"} due before {forecast.incomeName}.
              </p>
            </div>
            <Money minor={forecast.safeMinor} className={forecast.safeMinor < 0 ? "text-xl font-semibold text-destructive" : "text-xl font-semibold"} />
          </div>
          {forecast.bills.length ? (
            <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {forecast.bills.slice(0, 4).map((b) => (
                <li key={`${b.name}-${b.date}`} className="flex justify-between gap-3">
                  <span className="truncate">
                    {b.name} · {formatDate(b.date)}
                  </span>
                  <Money minor={b.amount_minor} />
                </li>
              ))}
              {forecast.bills.length > 4 ? <li>+{forecast.bills.length - 4} more</li> : null}
            </ul>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">An estimate from your recurring items; bills charged to a credit card aren&apos;t included.</p>
        </section>
      ) : null}

      {!setupComplete ? (
        <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <h2 className="font-semibold">Getting started</h2>
          <p className="mb-3 text-sm text-muted-foreground">A few steps to set up your household finances.</p>
          <ul className="space-y-1">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-muted">
                  {s.done ? (
                    <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-label="Done" />
                  ) : (
                    <CircleIcon className="size-5 shrink-0 text-muted-foreground" aria-label="To do" />
                  )}
                  <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeading
          title="Today"
          action={
            <Link href="/calendar" className="text-sm font-medium text-primary">
              Calendar
            </Link>
          }
        />
        {agenda.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {agenda.map((item) => (
              <CalendarItemRow key={item.key} item={item} names={names} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">Nothing on the calendar today.</p>
        )}
        {overdueTasks.length ? (
          <Link href="/tasks" className="mt-2 flex items-center justify-between rounded-xl px-1 text-sm font-medium text-destructive">
            {overdueTasks.length === 1 ? "1 overdue task" : `${overdueTasks.length} overdue tasks`}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        ) : null}
      </section>



      {activeGoals.length ? (
        <section>
          <SectionHeading
            title="Goals"
            action={
              <Link href="/goals" className="text-sm font-medium text-primary">
                All goals
              </Link>
            }
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {activeGoals.map((g) => {
              const progress = goalProgress(g, goalInputs.get(g.id) ?? {});
              return (
                <GoalCard
                  key={g.id}
                  goal={g}
                  progress={progress}
                  projection={goalProjection(g, progress, today)}
                  owner={memberName(ctx.members, g.assigned_user_id)}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading
          title="Recent activity"
          action={
            <Link href="/finances/transactions" className="text-sm font-medium text-primary">
              See all
            </Link>
          }
        />
        {recent.rows.length ? (
          <TransactionList rows={recent.rows} categories={categories} members={ctx.members} timezone={ctx.household.timezone} />
        ) : (
          <EmptyState
            icon={ReceiptIcon}
            title="No transactions yet"
            description="Use the + button to record an expense, income or transfer."
            action={
              accounts.length === 0 ? (
                <Button asChild variant="outline">
                  <Link href="/finances/accounts">Add an account first</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
    </div>
  );
}
