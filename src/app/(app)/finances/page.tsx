import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon, WalletIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { CategoryBars } from "@/features/finance/components/category-bars";
import { IncomeExpenseChart } from "@/features/finance/components/charts";
import { AccountGroups } from "@/features/finance/components/account-groups";
import { assetsNetWorthValue, getAssets } from "@/features/assets/queries";
import { getAccounts, getCategoryTotals, getMonthly, getSummary } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { addMonths, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { savingsRate, summariseBalances, surplus } from "@/lib/finance/calculations";

export const metadata: Metadata = { title: "Finances" };

export default function FinancesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const ctx = await requireHousehold();
  const month = monthStart(ctx.today);
  const end = monthEnd(month);
  const [accounts, summary, categories, monthly, assets] = await Promise.all([
    getAccounts(ctx),
    getSummary(ctx, month, end),
    getCategoryTotals(ctx, month, end),
    getMonthly(ctx, addMonths(month, -5), end),
    getAssets(ctx),
  ]);
  const assetValue = assetsNetWorthValue(assets);
  const balances = summariseBalances(accounts, assetValue);
  const rate = savingsRate(summary);
  const net = surplus(summary);

  return (
    <div className="space-y-6">
      <PageHeader title="Finances" description={`${monthLabel(month)} to date`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" value={<Money minor={summary.income_minor} />} />
        <StatCard label="Spending" value={<Money minor={summary.expense_minor} />} />
        <StatCard
          label={net >= 0 ? "Surplus" : "Deficit"}
          value={<Money minor={Math.abs(net)} />}
          hint={rate !== null ? `${rate}% of income unspent` : "No income recorded yet"}
          tone={net >= 0 ? "primary" : "default"}
        />
        <StatCard label="Net worth" value={<Money minor={balances.netWorth} />} hint={assetValue ? "Accounts, home & vehicles" : "Across all accounts"} href="/reports" />
      </div>

      {summary.savings_transfer_minor || summary.debt_principal_minor || summary.interest_minor ? (
        <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <h2 className="mb-3 text-sm font-semibold">Where the surplus went</h2>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Moved to savings</dt>
              <dd className="font-semibold">
                <Money minor={summary.savings_transfer_minor} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Debt principal paid</dt>
              <dd className="font-semibold">
                <Money minor={summary.debt_principal_minor} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Interest (in spending)</dt>
              <dd className="font-semibold">
                <Money minor={summary.interest_minor} />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Transfers to savings and debt principal aren&apos;t spending, so they don&apos;t reduce the surplus. Credit card
            purchases count once, when you buy — not again when you pay the card.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <h2 className="mb-3 text-sm font-semibold">Income vs spending · last 6 months</h2>
        <IncomeExpenseChart
          data={monthly.map((m) => ({ month: m.month, income: m.income_minor, expense: m.expense_minor }))}
        />
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Spending by category · {monthLabel(month, "short")}</h2>
          <Link href="/reports" className="text-sm font-medium text-primary">
            Reports
          </Link>
        </div>
        {categories.length ? (
          <CategoryBars
            rows={categories.map((c) => ({ id: c.category_id, name: c.category_name, total: c.total_minor, count: c.transaction_count }))}
            total={summary.expense_minor}
            hrefFor={(id) => `/finances/transactions?category=${id}&from=${month}&to=${end}`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No spending recorded this month.</p>
        )}
      </section>

      <section>
        <SectionHeading
          title="Accounts"
          action={
            <Link href="/finances/accounts" className="flex items-center gap-1 text-sm font-medium text-primary">
              Manage <ArrowRightIcon className="size-3.5" aria-hidden />
            </Link>
          }
        />
        {accounts.length ? (
          <AccountGroups accounts={accounts} members={ctx.members} />
        ) : (
          <EmptyState
            icon={WalletIcon}
            title="No accounts yet"
            description="Add your chequing, savings, cash and credit card accounts to start tracking."
            action={
              <Button asChild>
                <Link href="/finances/accounts">Add an account</Link>
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
