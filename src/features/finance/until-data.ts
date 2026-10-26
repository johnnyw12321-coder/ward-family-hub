import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import { addMonths, monthStart, type CalendarDate } from "@/lib/dates";
import { summariseBalances } from "@/lib/finance/calculations";
import type { Minor } from "@/lib/money";
import { getAccounts, getCategories, getRecurringItems } from "./queries";
import type { UntilBudgetLine, UntilRecurring } from "./until";

/** Everything the "How much until…?" sheet needs, serialisable for the client. */
export type UntilData = {
  today: CalendarDate;
  currency: string;
  cashMinor: Minor;
  budget: UntilBudgetLine[];
  recurring: UntilRecurring[];
  /** [category id, parent id] pairs. */
  parents: [string, string | null][];
  /** The next expected income date, for the "Next payday" button. */
  payday: CalendarDate | null;
};

const toMinor = (v: unknown) => Number(v);

export async function getUntilData(ctx: HouseholdContext): Promise<UntilData> {
  const db = ctx.supabase;
  const hh = ctx.household.id;
  const thisMonth = monthStart(ctx.today);
  const [accounts, items, categories, budgets] = await Promise.all([
    getAccounts(ctx),
    getRecurringItems(ctx),
    getCategories(ctx, { includeArchived: true }),
    // This month and up to a year ahead, plus the latest earlier month (used
    // when this month's budget hasn't been set yet).
    db.from("budgets").select("id, month").eq("household_id", hh).lte("month", addMonths(thisMonth, 12)).order("month", { ascending: false }).limit(24),
  ]);
  if (budgets.error) throw new Error("Could not load budgets");
  const rows = budgets.data ?? [];
  const latestEarlier = rows.find((b) => b.month <= thisMonth)?.month ?? null;
  const used = rows.filter((b) => b.month >= (latestEarlier ?? thisMonth));
  const names = new Map(categories.map((c) => [c.id, c.name]));

  let budget: UntilBudgetLine[] = [];
  if (used.length) {
    const monthOf = new Map(used.map((b) => [b.id, b.month as CalendarDate]));
    const res = await db
      .from("budget_allocations")
      .select("budget_id, category_id, amount_minor, rate_minor, rate_period, starts_on")
      .eq("household_id", hh)
      .in("budget_id", [...monthOf.keys()]);
    if (res.error) throw new Error("Could not load budget lines");
    budget = (res.data ?? []).map((a) => ({
      month: monthOf.get(a.budget_id)!,
      categoryId: a.category_id,
      name: names.get(a.category_id) ?? "Budget",
      amountMinor: toMinor(a.amount_minor),
      rateMinor: a.rate_minor === null ? null : toMinor(a.rate_minor),
      ratePeriod: a.rate_period as UntilBudgetLine["ratePeriod"],
      startsOn: a.starts_on as CalendarDate | null,
    }));
  }

  const cards = new Set(accounts.filter((a) => a.type === "credit_card").map((a) => a.id));
  const own = items.filter((i) => i.currency === ctx.household.base_currency);
  const recurring: UntilRecurring[] = own.map((i) => ({
    id: i.id,
    direction: i.direction,
    name: i.name,
    amountMinor: i.amount_minor,
    anchorDate: i.anchor_date,
    nextDueDate: i.next_due_date,
    endDate: i.end_date,
    frequency: i.frequency,
    intervalCount: i.interval_count,
    isActive: i.is_active,
    categoryId: i.category_id,
    paidByCard: Boolean(i.account_id && cards.has(i.account_id)),
  }));
  const payday = own.filter((i) => i.direction === "income" && i.is_active && i.next_due_date >= ctx.today).map((i) => i.next_due_date).sort()[0] ?? null;

  return {
    today: ctx.today,
    currency: ctx.household.base_currency,
    cashMinor: summariseBalances(accounts).availableCash,
    budget,
    recurring,
    parents: categories.map((c) => [c.id, c.parent_id]),
    payday,
  };
}
