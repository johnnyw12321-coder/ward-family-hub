import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Money } from "@/components/shared/money";
import { CardSkeleton, PageSkeleton } from "@/components/shared/skeletons";
import { FitText } from "@/components/shared/fit-text";
import { StatCard } from "@/components/shared/stat-card";
import { ThisMonth } from "@/features/finance/components/this-month";
import { getAccounts, getRecurringItems, getSummary } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { addMonths, formatDate, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { leftOver, percentChange, summariseBalances } from "@/lib/finance/calculations";

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

  // Home is about money for the month; tasks, events, goals and the rest
  // reach you as reminders (the bell) instead.
  const [accounts, summary, lastSummary, recurring] = await Promise.all([
    getAccounts(ctx),
    getSummary(ctx, month, monthEnd(month)),
    getSummary(ctx, lastMonth, lastMonthSameDay),
    getRecurringItems(ctx),
  ]);
  const balances = summariseBalances(accounts);
  const net = leftOver(summary);
  const spendChange = percentChange(summary.expense_minor, lastSummary.expense_minor);
  const overdueBills = recurring.filter((r) => r.direction === "bill" && r.next_due_date < today);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: ctx.household.timezone }).format(new Date()));

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

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Available cash" value={<Money minor={balances.availableCash} />} hint="Cash + chequing" href="/finances/accounts" />
        <StatCard label="Savings" value={<Money minor={balances.savings} />} href="/finances/accounts" />
      </div>

      <Suspense fallback={<CardSkeleton lines={6} />}>
        <ThisMonth ctx={ctx} />
      </Suspense>
    </div>
  );
}
