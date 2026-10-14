import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon, CheckCircle2Icon, CircleIcon, ReceiptIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { BillRow } from "@/features/finance/components/bill-row";
import { BudgetBar } from "@/features/finance/components/budget-bar";
import { TransactionList } from "@/features/finance/components/transaction-list";
import {
  getAccounts,
  getBudgetProgress,
  getCategories,
  getRecurringItems,
  getSummary,
  getTransactions,
} from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { addDays, addMonths, formatDate, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { budgetStatus, monthElapsedPercent, percentChange, summariseBalances, surplus } from "@/lib/finance/calculations";

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

  const [accounts, summary, lastSummary, budget, recurring, recent, categories] = await Promise.all([
    getAccounts(ctx),
    getSummary(ctx, month, monthEnd(month)),
    getSummary(ctx, lastMonth, lastMonthSameDay),
    getBudgetProgress(ctx, month),
    getRecurringItems(ctx),
    getTransactions(ctx, {}, { pageSize: 6 }),
    getCategories(ctx, { includeArchived: true }),
  ]);

  const balances = summariseBalances(accounts);
  const net = surplus(summary);
  const spendChange = percentChange(summary.expense_minor, lastSummary.expense_minor);
  const horizon = addDays(today, 14);
  const upcoming = recurring.filter((r) => r.next_due_date <= horizon).slice(0, 5);
  const overdueBills = recurring.filter((r) => r.direction === "bill" && r.next_due_date < today);
  const budgetLines = budget.filter((b) => b.allocation_id);
  const watchLines = budgetLines
    .map((b) => ({ b, s: budgetStatus(b.allocated_minor, b.carried_in_minor, b.spent_minor) }))
    .sort((x, y) => y.s.percentUsed - x.s.percentUsed)
    .slice(0, 4);
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
        <div className="mt-1 text-3xl font-semibold tracking-tight tabular">
          <Money minor={net} tone="plain" />
        </div>
        <div className="text-sm text-primary-foreground/80">{net >= 0 ? "surplus" : "deficit"} this month</div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-primary-foreground/15 pt-4 text-sm">
          <div>
            <div className="text-primary-foreground/75">Income</div>
            <div className="font-semibold tabular">
              <Money minor={summary.income_minor} />
            </div>
          </div>
          <div>
            <div className="text-primary-foreground/75">Spending</div>
            <div className="font-semibold tabular">
              <Money minor={summary.expense_minor} />
            </div>
            {spendChange !== null ? (
              <div className="text-xs text-primary-foreground/75">
                {spendChange > 0 ? "▲" : spendChange < 0 ? "▼" : ""} {Math.abs(spendChange)}% vs same point last month
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available cash" value={<Money minor={balances.availableCash} />} hint="Cash + chequing" href="/finances/accounts" />
        <StatCard label="Savings" value={<Money minor={balances.savings} />} href="/finances/accounts" />
        <StatCard label="Owed" value={<Money minor={balances.totalLiabilities} />} hint="Cards and loans" href="/finances/debts" />
        <StatCard label="Net worth" value={<Money minor={balances.netWorth} />} hint="Accounts only" href="/reports" />
      </div>

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
          title="Upcoming bills"
          action={
            <Link href="/finances/bills" className="text-sm font-medium text-primary">
              All bills
            </Link>
          }
        />
        {upcoming.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {upcoming.map((item) => (
              <BillRow key={item.id} item={item} today={today} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
            Nothing due in the next two weeks.
          </p>
        )}
      </section>

      {watchLines.length ? (
        <section>
          <SectionHeading
            title="Budget"
            action={
              <Link href="/finances/budgets" className="text-sm font-medium text-primary">
                Full budget
              </Link>
            }
          />
          <div className="rounded-2xl bg-card px-4 py-1 shadow-card ring-1 ring-border/80">
            {watchLines.map(({ b }) => (
              <BudgetBar
                key={b.allocation_id}
                name={b.category_name}
                allocated={b.allocated_minor}
                carriedIn={b.carried_in_minor}
                spent={b.spent_minor}
                pacePercent={monthElapsedPercent(today, month)}
                compact
              />
            ))}
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
