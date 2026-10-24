import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DownloadIcon } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CategoryBars } from "@/features/finance/components/category-bars";
import { IncomeExpenseChart, NetWorthChart } from "@/features/finance/components/charts";
import { loadReport } from "@/features/reports/data";
import { PERIOD_PRESETS, resolvePeriod } from "@/features/reports/period";
import { requireHousehold } from "@/lib/auth/context";
import { formatDate, formatInstant } from "@/lib/dates";
import { leftOver, leftOverRate, percentChange } from "@/lib/finance/calculations";

export const metadata: Metadata = { title: "Reports" };

type SP = PageProps<"/reports">["searchParams"];

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Reports" />
          <PageSkeleton />
        </>
      }
    >
      <Report searchParams={searchParams} />
    </Suspense>
  );
}

function Change({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  const pct = percentChange(now, before);
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={cn("tabular", pct === 0 ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

async function Report({ searchParams }: { searchParams: SP }) {
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const ctx = await requireHousehold();
  const period = resolvePeriod(sp, ctx.today);
  const { summary, previous, comparison, income, monthly, history, assetCosts } = await loadReport(ctx, period);
  const net = leftOver(summary);
  const prevNet = leftOver(previous);
  const rate = leftOverRate(summary);
  const currentYear = Number(ctx.today.slice(0, 4));
  const years = Array.from({ length: 15 }, (_, i) => currentYear - i);
  const query = new URLSearchParams(Object.entries({ preset: period.preset, from: sp.from, to: sp.to, year: sp.year }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={`${period.label} · compared with ${period.compareLabel}`}
        actions={<PrintButton />}
      />

      <form method="get" className="no-print grid gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:grid-cols-4">
        <label className="space-y-1 text-sm sm:col-span-1">
          <span className="font-medium">Period</span>
          <NativeSelect name="preset" defaultValue={period.preset}>
            {PERIOD_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Year (annual summary)</span>
          <NativeSelect name="year" defaultValue={sp.year ?? String(currentYear - 1)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">From (custom)</span>
            <Input type="date" name="from" defaultValue={sp.from} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">To (custom)</span>
            <Input type="date" name="to" defaultValue={sp.to} />
          </label>
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" className="flex-1 sm:flex-none">
            Update report
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/export/report?${query}`} download>
              <DownloadIcon data-icon="inline-start" /> CSV
            </a>
          </Button>
        </div>
      </form>

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          {ctx.household.name} — {period.label}
        </h2>
        <p className="text-sm">
          {formatDate(period.from)} to {formatDate(period.to)} · printed {formatInstant(new Date(), ctx.household.timezone)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" value={<Money minor={summary.income_minor} />} hint={<Change now={summary.income_minor} before={previous.income_minor} />} />
        <StatCard label="Spending" value={<Money minor={summary.expense_minor} />} hint={<Change now={summary.expense_minor} before={previous.expense_minor} invert />} />
        <StatCard label={net >= 0 ? "Left over" : "Short"} value={<Money minor={Math.abs(net)} />} hint={<>was <Money minor={prevNet} /></>} />
        <StatCard label="Kept" value={rate === null ? "—" : `${rate}%`} hint="Share of income left after spending and loan payments" />
      </div>

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <h2 className="mb-3 text-sm font-semibold">Money movements</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium" />
              <th className="py-1 text-right font-medium">This period</th>
              <th className="py-1 text-right font-medium">Before</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {(
              [
                ["Income", summary.income_minor, previous.income_minor, false],
                ["Spending", summary.expense_minor, previous.expense_minor, true],
                ["  of which interest", summary.interest_minor, previous.interest_minor, true],
                ["Moved to savings", summary.savings_transfer_minor, previous.savings_transfer_minor, false],
                ["Debt principal repaid", summary.debt_principal_minor, previous.debt_principal_minor, false],
                ["  of which loans & mortgage", summary.loan_payment_minor, previous.loan_payment_minor, false],
                ["Left over", net, prevNet, false],
              ] as const
            ).map(([label, now, before, invert]) => (
              <tr key={label} className="border-t">
                <td className="py-2 whitespace-pre">{label}</td>
                <td className="py-2 text-right">
                  <Money minor={now} />
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  <Money minor={before} />
                </td>
                <td className="py-2 text-right">
                  <Change now={now} before={before} invert={invert} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <h2 className="mb-3 text-sm font-semibold">Income vs spending by month</h2>
        <IncomeExpenseChart data={monthly.map((m) => ({ month: m.month, income: m.income_minor, expense: m.expense_minor }))} height={240} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <h2 className="mb-3 text-sm font-semibold">Spending by category</h2>
          {comparison.some((c) => c.current > 0) ? (
            <CategoryBars
              rows={comparison.filter((c) => c.current > 0).map((c) => ({ id: c.id, name: c.name, total: c.current, count: c.count }))}
              total={summary.expense_minor}
              hrefFor={(id) => `/finances/transactions?category=${id}&from=${period.from}&to=${period.to}`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No spending in this period.</p>
          )}
        </section>
        <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <h2 className="mb-3 text-sm font-semibold">Income by source</h2>
          {income.length ? (
            <CategoryBars
              rows={income.map((c) => ({ id: c.category_id, name: c.category_name, total: c.total_minor, count: c.transaction_count }))}
              total={summary.income_minor}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No income in this period.</p>
          )}
        </section>
      </div>

      {comparison.length ? (
        <section className="overflow-x-auto rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <h2 className="mb-3 text-sm font-semibold">Category comparison</h2>
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Category</th>
                <th className="py-1 text-right font-medium">This period</th>
                <th className="py-1 text-right font-medium">Before</th>
                <th className="py-1 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {comparison.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 text-right">
                    <Money minor={c.current} />
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    <Money minor={c.previous} />
                  </td>
                  <td className="py-2 text-right">
                    <Change now={c.current} before={c.previous} invert />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {assetCosts.length ? (
        <section className="overflow-x-auto rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
          <h2 className="mb-1 text-sm font-semibold">Home & vehicle costs</h2>
          <p className="mb-3 text-xs text-muted-foreground">Expenses linked to each home or vehicle, plus costs logged on maintenance records only.</p>
          <table className="w-full min-w-[360px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium" />
                <th className="py-1 text-right font-medium">In accounts</th>
                <th className="py-1 text-right font-medium">Logged only</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {assetCosts.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="py-2">
                    <Link href={`/${a.type === "vehicle" ? "vehicles" : "property"}/${a.id}`} className="text-primary">
                      {a.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Money minor={a.ledger} />
                  </td>
                  <td className="py-2 text-right text-muted-foreground">
                    <Money minor={a.logged} />
                  </td>
                  <td className="py-2 text-right font-medium">
                    <Money minor={a.ledger + a.logged} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <h2 className="mb-3 text-sm font-semibold">Net worth</h2>
        <NetWorthChart data={history.map((h) => ({ month: h.month, assets: h.assets_minor + h.property_minor, liabilities: h.liabilities_minor }))} />
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        All figures are calculated from recorded transactions, so past periods don&apos;t change when budgets change. Transfers
        between your own accounts are never counted as income or spending. Left over is income minus spending minus loan and
        mortgage payments; credit card payments aren&apos;t taken off because the purchases already count as spending.
      </p>
    </div>
  );
}
