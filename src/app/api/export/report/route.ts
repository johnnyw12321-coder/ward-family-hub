import { NextResponse, type NextRequest } from "next/server";
import { loadReport } from "@/features/reports/data";
import { resolvePeriod } from "@/features/reports/period";
import { getActionContext } from "@/lib/auth/context";
import { toCsv, type CsvCell } from "@/lib/csv";
import { leftOver } from "@/lib/finance/calculations";
import { toDecimalString } from "@/lib/money";

/** CSV of the report currently shown: summary, monthly trend and categories. */
export async function GET(request: NextRequest) {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { ctx } = auth;
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const period = resolvePeriod(sp, ctx.today);
  const { summary, previous, comparison, income, monthly, assetCosts } = await loadReport(ctx, period);
  const m = (v: number) => toDecimalString(v, ctx.household.base_currency);

  const rows: CsvCell[][] = [
    ["Summary", "Period", period.from, period.to, ""],
    ["Summary", "Comparison", period.prevFrom, period.prevTo, ""],
    ["Summary", "Income", m(summary.income_minor), m(previous.income_minor), ""],
    ["Summary", "Spending", m(summary.expense_minor), m(previous.expense_minor), ""],
    ["Summary", "Interest", m(summary.interest_minor), m(previous.interest_minor), ""],
    ["Summary", "Moved to savings", m(summary.savings_transfer_minor), m(previous.savings_transfer_minor), ""],
    ["Summary", "Debt principal repaid", m(summary.debt_principal_minor), m(previous.debt_principal_minor), ""],
    ["Summary", "Loan & mortgage payments", m(summary.loan_payment_minor), m(previous.loan_payment_minor), ""],
    ["Summary", "Left over", m(leftOver(summary)), m(leftOver(previous)), ""],
    ...monthly.map((r) => ["Monthly", r.month, m(r.income_minor), m(r.expense_minor), m(r.income_minor - r.expense_minor)]),
    ...comparison.map((c) => ["Spending category", c.name, m(c.current), m(c.previous), String(c.count)]),
    ...income.map((c) => ["Income category", c.category_name, m(c.total_minor), "", String(c.transaction_count)]),
    ...assetCosts.map((a) => ["Home or vehicle cost", a.name, m(a.ledger), m(a.logged), m(a.ledger + a.logged)]),
  ];
  const csv = toCsv(["Section", "Item", "Value / This period", "Comparison / Spending", "Net / Count"], rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ward-report-${period.from}-to-${period.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
