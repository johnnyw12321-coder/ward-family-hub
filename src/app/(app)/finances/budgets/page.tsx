import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PiggyBankIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { AddAllocationButton, CopyBudgetButton, EditAllocationButton } from "@/features/finance/components/budget-editor";
import { RATE_PERIOD_LABELS } from "@/features/finance/until";
import { BudgetBar } from "@/features/finance/components/budget-bar";
import { getBudgetMonths, getBudgetProgress, getCategories, getCategoryTotals } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { addMonths, isCalendarDate, monthEnd, monthLabel, monthStart } from "@/lib/dates";
import { BUDGET_WARNING_PERCENT, budgetStatus, monthElapsedPercent } from "@/lib/finance/calculations";
import { minorToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage({ searchParams }: PageProps<"/finances/budgets">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Budget" />
          <CardSkeleton lines={6} />
        </>
      }
    >
      <BudgetView searchParams={searchParams} />
    </Suspense>
  );
}

async function BudgetView({ searchParams }: { searchParams: PageProps<"/finances/budgets">["searchParams"] }) {
  const sp = await searchParams;
  const ctx = await requireHousehold();
  const requested = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : null;
  const month = requested && isCalendarDate(requested) ? requested : monthStart(ctx.today);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const isCurrent = month === monthStart(ctx.today);

  const [rows, categories, lastMonthTotals, months] = await Promise.all([
    getBudgetProgress(ctx, month),
    getCategories(ctx, { kind: "expense" }),
    getCategoryTotals(ctx, prev, monthEnd(prev), "expense", false),
    getBudgetMonths(ctx),
  ]);
  const lines = rows.filter((r) => r.allocation_id);
  const unbudgeted = rows.find((r) => !r.allocation_id)?.spent_minor ?? 0;
  const lastByCat = new Map(lastMonthTotals.map((t) => [t.category_id, t.total_minor]));
  // A parent line's comparison includes its subcategories.
  const lastFor = (categoryId: string) =>
    (lastByCat.get(categoryId) ?? 0) +
    categories.filter((c) => c.parent_id === categoryId && !lines.some((l) => l.category_id === c.id)).reduce((s, c) => s + (lastByCat.get(c.id) ?? 0), 0);

  const totals = lines.reduce(
    (acc, l) => ({
      available: acc.available + l.allocated_minor + l.carried_in_minor,
      spent: acc.spent + l.spent_minor,
    }),
    { available: 0, spent: 0 },
  );
  const pace = isCurrent ? monthElapsedPercent(ctx.today, month) : undefined;
  const flagged = lines.filter((l) => budgetStatus(l.allocated_minor, l.carried_in_minor, l.spent_minor).level !== "ok");
  const prevHasBudget = months.includes(prev);
  const ym = (d: string) => d.slice(0, 7);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budget"
        actions={ctx.canWrite && lines.length ? <AddAllocationButton month={month} categories={categories} currency={ctx.household.base_currency} label="Add" /> : null}
      />
      <nav aria-label="Month" className="flex items-center justify-between rounded-2xl bg-card p-1.5 shadow-card ring-1 ring-border/80">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/finances/budgets?month=${ym(prev)}`} aria-label={`Previous month, ${monthLabel(prev)}`}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <div className="text-center">
          <div className="font-semibold">{monthLabel(month)}</div>
          {!isCurrent ? (
            <Link href="/finances/budgets" className="text-xs text-primary">
              Back to this month
            </Link>
          ) : (
            <div className="text-xs text-muted-foreground">This month</div>
          )}
        </div>
        <Button asChild variant="ghost" size="icon">
          <Link href={`/finances/budgets?month=${ym(next)}`} aria-label={`Next month, ${monthLabel(next)}`}>
            <ChevronRightIcon />
          </Link>
        </Button>
      </nav>

      {lines.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <StatCard label="Budgeted" value={<Money minor={totals.available} trimZeroCents />} />
            <StatCard label="Spent" value={<Money minor={totals.spent} trimZeroCents />} />
            <StatCard
              label={totals.available - totals.spent >= 0 ? "Left" : "Over"}
              value={<Money minor={Math.abs(totals.available - totals.spent)} trimZeroCents />}
              tone={totals.available - totals.spent >= 0 ? "primary" : "default"}
            />
          </div>

          {flagged.length ? (
            <p role="status" className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-foreground ring-1 ring-warning/30">
              {flagged.length === 1 ? "1 category is" : `${flagged.length} categories are`} at or over {BUDGET_WARNING_PERCENT}% of budget.
            </p>
          ) : null}

          <section className="rounded-2xl bg-card px-4 py-1 shadow-card ring-1 ring-border/80">
            <ul className="divide-y">
              {lines.map((l) => {
                const last = lastFor(l.category_id!);
                return (
                  <li key={l.allocation_id} className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <BudgetBar
                        name={l.category_name}
                        allocated={l.allocated_minor}
                        carriedIn={l.carried_in_minor}
                        spent={l.spent_minor}
                        pacePercent={pace}
                      />
                      {l.rate_minor !== null && l.rate_period ? (
                        <div className="-mt-2 pb-1 text-xs text-muted-foreground">
                          <Money minor={l.rate_minor} /> {RATE_PERIOD_LABELS[l.rate_period]}
                        </div>
                      ) : null}
                      {last > 0 ? (
                        <div className="-mt-2 pb-3 text-xs text-muted-foreground">
                          {monthLabel(prev, "short")}: <Money minor={last} />
                          {l.carry_forward ? " · carries forward" : ""}
                        </div>
                      ) : l.carry_forward ? (
                        <div className="-mt-2 pb-3 text-xs text-muted-foreground">Carries forward</div>
                      ) : null}
                    </div>
                    {ctx.canWrite ? (
                      <div className="pt-2.5">
                        <EditAllocationButton
                          month={month}
                          categories={categories}
                          currency={ctx.household.base_currency}
                          allocationId={l.allocation_id!}
                          name={l.category_name}
                          initial={{
                            month,
                            categoryId: l.category_id!,
                            amount: minorToInput(l.rate_minor ?? l.allocated_minor),
                            ratePeriod: l.rate_period ?? "month",
                            carryForward: l.carry_forward,
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {unbudgeted > 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              <Money minor={unbudgeted} className="font-medium text-foreground" /> spent in categories without a budget line.{" "}
              <Link href={`/finances/transactions?kind=expense&from=${month}&to=${monthEnd(month)}`} className="text-primary">
                Review
              </Link>
            </p>
          ) : null}

          {pace !== undefined ? (
            <p className="px-1 text-xs text-muted-foreground">The thin marker on each bar shows where spending would be if spread evenly across the month.</p>
          ) : null}

          {ctx.canWrite ? (
            <div className="flex flex-wrap gap-2">
              <CopyBudgetButton from={month} to={next} label={`Copy to ${monthLabel(next, "short")}`} />
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={PiggyBankIcon}
          title={`No budget for ${monthLabel(month)}`}
          description={
            prevHasBudget
              ? `Copy last month's budget (unspent amounts on lines marked "carry forward" come along), or start a new one.`
              : "Add budget lines for the categories you want to keep an eye on."
          }
          action={
            ctx.canWrite ? (
              <div className="flex flex-wrap justify-center gap-2">
                {prevHasBudget ? <CopyBudgetButton from={prev} to={month} label={`Copy ${monthLabel(prev, "short")}`} variant="default" /> : null}
                <AddAllocationButton month={month} categories={categories} currency={ctx.household.base_currency} />
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
