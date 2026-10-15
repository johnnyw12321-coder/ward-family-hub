import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandmarkIcon, TrendingDownIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { getAccounts, getSummary } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { addMonths, monthLabel, monthStart, yearStart } from "@/lib/dates";
import { ACCOUNT_TYPE_LABELS, isLiability, projectPayoff } from "@/lib/finance/calculations";

export const metadata: Metadata = { title: "Debts" };

export default function DebtsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Debts" />
          <ListSkeleton rows={4} />
        </>
      }
    >
      <DebtsView />
    </Suspense>
  );
}

async function DebtsView() {
  const ctx = await requireHousehold();
  const [accounts, ytd] = await Promise.all([getAccounts(ctx), getSummary(ctx, yearStart(ctx.today), ctx.today)]);
  const debts = accounts
    .filter((a) => isLiability(a.type))
    .map((a) => {
      const owed = -a.balance_minor;
      const projection =
        a.minimum_payment_minor && owed > 0
          ? projectPayoff({
              owedMinor: owed,
              aprPercent: a.interest_rate_apr ?? 0,
              monthlyPaymentMinor: a.minimum_payment_minor,
              startMonth: addMonths(monthStart(ctx.today), 1),
            })
          : null;
      return { account: a, owed, projection };
    })
    .sort((x, y) => Number(y.account.interest_rate_apr ?? 0) - Number(x.account.interest_rate_apr ?? 0));
  const totalOwed = debts.reduce((s, d) => s + Math.max(0, d.owed), 0);
  const highest = debts.find((d) => d.owed > 0 && d.account.interest_rate_apr);

  return (
    <div className="space-y-5">
      <PageHeader title="Debts" description="Credit cards, loans and the mortgage, ordered by interest rate." />
      {debts.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <StatCard label="Total owed" value={<Money minor={totalOwed} trimZeroCents />} />
            <StatCard label="Principal paid this year" value={<Money minor={ytd.debt_principal_minor} trimZeroCents />} />
            <StatCard label="Interest this year" value={<Money minor={ytd.interest_minor} trimZeroCents />} />
          </div>
          {highest ? (
            <p className="flex gap-2 rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
              <TrendingDownIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Extra payments save the most on <span className="font-semibold">{highest.account.name}</span> (
                {Number(highest.account.interest_rate_apr)}% APR) — the highest rate you have.
              </span>
            </p>
          ) : null}
          <ul className="space-y-3">
            {debts.map(({ account, owed, projection }) => (
              <li key={account.id}>
                <Link
                  href={`/finances/accounts/${account.id}`}
                  className="block rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                        {account.interest_rate_apr ? ` · ${Number(account.interest_rate_apr)}% APR` : " · rate not set"}
                        {account.minimum_payment_minor ? (
                          <>
                            {" · "}
                            <Money minor={account.minimum_payment_minor} /> / month
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <Money minor={Math.max(0, owed)} className="text-lg font-semibold" />
                      <div className="text-[11px] text-muted-foreground">owed</div>
                    </div>
                  </div>
                  <div className="mt-3 border-t pt-3 text-sm">
                    {owed <= 0 ? (
                      <span className="font-medium text-success">Paid off</span>
                    ) : !projection ? (
                      <span className="text-muted-foreground">Add the monthly payment on the account to see a payoff date.</span>
                    ) : projection.status === "never" ? (
                      <span className="text-destructive">
                        The monthly payment doesn&apos;t cover the interest (about <Money minor={projection.monthlyInterest} /> a month), so the
                        balance won&apos;t go down.
                      </span>
                    ) : projection.status === "ok" ? (
                      <span>
                        Paid off by <span className="font-semibold">{monthLabel(projection.payoffMonth)}</span>{" "}
                        <span className="text-muted-foreground">
                          ({projection.months} payments, about <Money minor={projection.totalInterest} /> interest)
                        </span>
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-1 text-xs text-muted-foreground">
            Projections assume the same monthly payment and rate, with interest charged monthly. Your lender&apos;s figures may
            differ slightly.
          </p>
        </>
      ) : (
        <EmptyState
          icon={LandmarkIcon}
          title="No debts tracked"
          description="Add a credit card, loan or mortgage as an account to track what you owe and when it will be paid off."
        />
      )}
    </div>
  );
}
