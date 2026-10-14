import "server-only";
import { getAssetCosts, getAssets, getAssetValueHistory } from "@/features/assets/queries";
import { getAccountHistory, getCategoryTotals, getMonthly, getSummary } from "@/features/finance/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import { addMonths, monthStart } from "@/lib/dates";
import type { Minor } from "@/lib/money";
import type { Period } from "./period";

export type CategoryComparison = { id: string; name: string; current: Minor; previous: Minor; count: number };

/** Everything the reports page and its exports need, derived from the ledger. */
export async function loadReport(ctx: HouseholdContext, period: Period) {
  const historyFrom = addMonths(monthStart(period.to), -23);
  const historyStart = historyFrom < period.trendFrom ? historyFrom : period.trendFrom;
  const [summary, previous, expenseNow, expensePrev, incomeNow, monthly, accountHistory, assetHistory, assets, assetCostMap] = await Promise.all([
    getSummary(ctx, period.from, period.to),
    getSummary(ctx, period.prevFrom, period.prevTo),
    getCategoryTotals(ctx, period.from, period.to, "expense"),
    getCategoryTotals(ctx, period.prevFrom, period.prevTo, "expense"),
    getCategoryTotals(ctx, period.from, period.to, "income"),
    getMonthly(ctx, period.trendFrom, period.trendTo),
    getAccountHistory(ctx, historyStart, period.to),
    getAssetValueHistory(ctx, historyStart, period.to),
    getAssets(ctx, undefined, { includeArchived: true }),
    getAssetCosts(ctx, period.from, period.to),
  ]);
  const assetCosts = assets
    .map((a) => ({ id: a.id, name: a.name, type: a.type, ...(assetCostMap.get(a.id) ?? { ledger: 0, logged: 0 }) }))
    .filter((a) => a.ledger + a.logged > 0)
    .sort((x, y) => y.ledger + y.logged - (x.ledger + x.logged));
  // Net worth history = ledger accounts + valued property and vehicles.
  const history = accountHistory.map((h) => ({ ...h, property_minor: assetHistory.get(h.month) ?? 0 }));

  const prevById = new Map(expensePrev.map((r) => [r.category_id, r]));
  const comparison: CategoryComparison[] = expenseNow.map((r) => ({
    id: r.category_id,
    name: r.category_name,
    current: r.total_minor,
    previous: prevById.get(r.category_id)?.total_minor ?? 0,
    count: r.transaction_count,
  }));
  for (const p of expensePrev) {
    if (!comparison.some((c) => c.id === p.category_id)) {
      comparison.push({ id: p.category_id, name: p.category_name, current: 0, previous: p.total_minor, count: 0 });
    }
  }
  comparison.sort((a, b) => b.current - a.current || b.previous - a.previous);

  return { summary, previous, comparison, income: incomeNow, monthly, history, assetCosts };
}
