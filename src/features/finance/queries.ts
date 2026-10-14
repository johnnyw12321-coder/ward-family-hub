import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";
import type {
  AccountHistoryRow,
  AccountWithBalance,
  BudgetProgressRow,
  Category,
  CategoryKind,
  CategoryTotalRow,
  MonthlyRow,
  RecurringItem,
  RecurringPayment,
  SummaryRow,
  TransactionRow,
} from "./types";
import type { TransactionFilters } from "./schemas";

/**
 * Read queries for the finance module. All run as the signed-in user with RLS,
 * and additionally filter by household_id so a user who later belongs to
 * several households only ever sees the active one.
 *
 * PostgREST returns bigint columns as JSON numbers; household-scale values are
 * far below 2^53, and toMinor() asserts that they are safe integers.
 */

class QueryError extends Error {
  constructor(scope: string, cause: { message?: string; code?: string }) {
    super(`Could not load ${scope}`);
    this.name = "QueryError";
    // Keep DB details server-side only.
    console.error(`[query:${scope}]`, { code: cause.code, message: cause.message });
  }
}

function toMinor(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n)) throw new RangeError("Unsafe money value from database");
  return n;
}

const ACCOUNT_COLUMNS =
  "id, name, type, currency, institution, last4, owner_scope, owner_user_id, credit_limit_minor, interest_rate_apr, minimum_payment_minor, payment_due_day, include_in_net_worth, is_archived, sort_order, notes";

export async function getAccounts(ctx: HouseholdContext, options: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  let query = ctx.supabase
    .from("financial_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("household_id", ctx.household.id)
    .order("is_archived")
    .order("sort_order")
    .order("name");
  if (!options.includeArchived) query = query.eq("is_archived", false);
  const [accounts, balances] = await Promise.all([
    query,
    ctx.supabase
      .from("account_balances")
      .select("account_id, balance_minor, cleared_balance_minor, reconciled_balance_minor, entry_count")
      .eq("household_id", ctx.household.id),
  ]);
  if (accounts.error) throw new QueryError("accounts", accounts.error);
  if (balances.error) throw new QueryError("balances", balances.error);
  const byId = new Map(balances.data.map((b) => [b.account_id as string, b]));
  return accounts.data.map((a) => {
    const b = byId.get(a.id as string);
    return {
      ...(a as Omit<AccountWithBalance, "balance_minor" | "cleared_balance_minor" | "reconciled_balance_minor" | "entry_count">),
      credit_limit_minor: a.credit_limit_minor === null ? null : toMinor(a.credit_limit_minor),
      minimum_payment_minor: a.minimum_payment_minor === null ? null : toMinor(a.minimum_payment_minor),
      interest_rate_apr: a.interest_rate_apr === null ? null : String(a.interest_rate_apr),
      balance_minor: toMinor(b?.balance_minor ?? 0),
      cleared_balance_minor: toMinor(b?.cleared_balance_minor ?? 0),
      reconciled_balance_minor: toMinor(b?.reconciled_balance_minor ?? 0),
      entry_count: Number(b?.entry_count ?? 0),
    };
  });
}

export async function getAccount(ctx: HouseholdContext, id: string): Promise<AccountWithBalance | null> {
  const all = await getAccounts(ctx, { includeArchived: true });
  return all.find((a) => a.id === id) ?? null;
}

export async function getCategories(ctx: HouseholdContext, options: { kind?: CategoryKind; includeArchived?: boolean } = {}): Promise<Category[]> {
  let query = ctx.supabase
    .from("transaction_categories")
    .select("id, parent_id, kind, name, icon, color, system_key, is_archived, sort_order")
    .eq("household_id", ctx.household.id)
    .order("sort_order")
    .order("name");
  if (options.kind) query = query.eq("kind", options.kind);
  if (!options.includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query;
  if (error) throw new QueryError("categories", error);
  return data as Category[];
}

const TX_COLUMNS =
  "id, kind, occurred_at, occurred_on, currency, description, merchant, notes, category_id, category_name, category_parent_id, category_parent_name, payment_method, person_user_id, group_id, recurring_id, account_id, account_name, to_account_id, to_account_name, amount_minor, signed_amount_minor, created_by, updated_by, created_at, updated_at, asset_id, family_member_id";

function normaliseTx(row: Record<string, unknown>): TransactionRow {
  return {
    ...(row as TransactionRow),
    amount_minor: toMinor(row.amount_minor),
    signed_amount_minor: toMinor(row.signed_amount_minor),
  };
}

/**
 * Build a quoted PostgREST ilike operand from user search text: LIKE
 * wildcards are escaped, then the value is double-quoted so commas and
 * parentheses cannot alter the filter expression.
 */
export function ilikeOperand(q: string): string {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return `"${like.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

export const TRANSACTIONS_PAGE_SIZE = 40;

export async function getTransactions(
  ctx: HouseholdContext,
  filters: TransactionFilters,
  options: { pageSize?: number; categoryIds?: string[] } = {},
): Promise<{ rows: TransactionRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = options.pageSize ?? TRANSACTIONS_PAGE_SIZE;
  const page = filters.page ?? 1;
  let query = ctx.supabase
    .from("transaction_details")
    .select(TX_COLUMNS, { count: "exact" })
    .eq("household_id", ctx.household.id);

  if (filters.q) {
    const p = ilikeOperand(filters.q);
    query = query.or(`description.ilike.${p},merchant.ilike.${p},notes.ilike.${p}`);
  }
  if (filters.kind === "other") query = query.in("kind", ["opening_balance", "adjustment"]);
  else if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.account) query = query.or(`account_id.eq.${filters.account},to_account_id.eq.${filters.account}`);
  if (filters.category) {
    const ids = options.categoryIds ?? [filters.category];
    query = query.in("category_id", ids);
  }
  if (filters.person) query = query.eq("person_user_id", filters.person);
  if (filters.asset) query = query.eq("asset_id", filters.asset);
  if (filters.member) query = query.eq("family_member_id", filters.member);
  if (filters.from) query = query.gte("occurred_on", filters.from);
  if (filters.to) query = query.lte("occurred_on", filters.to);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new QueryError("transactions", error);
  return { rows: data.map(normaliseTx), total: count ?? 0, page, pageSize };
}

/** All matching rows for export, fetched in pages to stay under API limits. */
export async function getAllTransactions(
  ctx: HouseholdContext,
  filters: TransactionFilters,
  categoryIds?: string[],
  maxRows = 100_000,
): Promise<TransactionRow[]> {
  const out: TransactionRow[] = [];
  for (let page = 1; out.length < maxRows; page++) {
    const res = await getTransactions(ctx, { ...filters, page }, { pageSize: 1000, categoryIds });
    out.push(...res.rows);
    if (res.rows.length < 1000) break;
  }
  return out;
}

export async function getTransaction(ctx: HouseholdContext, id: string): Promise<TransactionRow | null> {
  const { data, error } = await ctx.supabase
    .from("transaction_details")
    .select(TX_COLUMNS)
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new QueryError("transaction", error);
  return data ? normaliseTx(data) : null;
}

export async function getGroupTransactions(ctx: HouseholdContext, groupId: string): Promise<TransactionRow[]> {
  const { data, error } = await ctx.supabase
    .from("transaction_details")
    .select(TX_COLUMNS)
    .eq("household_id", ctx.household.id)
    .eq("group_id", groupId);
  if (error) throw new QueryError("group", error);
  return data.map(normaliseTx);
}

export async function getSummary(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<SummaryRow> {
  const { data, error } = await ctx.supabase
    .rpc("report_summary", { p_household_id: ctx.household.id, p_from: from, p_to: to })
    .single();
  if (error) throw new QueryError("summary", error);
  const r = data as Record<string, unknown>;
  return {
    income_minor: toMinor(r.income_minor),
    expense_minor: toMinor(r.expense_minor),
    interest_minor: toMinor(r.interest_minor),
    savings_transfer_minor: toMinor(r.savings_transfer_minor),
    debt_principal_minor: toMinor(r.debt_principal_minor),
    transaction_count: Number(r.transaction_count),
  };
}

export async function getMonthly(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<MonthlyRow[]> {
  const { data, error } = await ctx.supabase.rpc("report_monthly", {
    p_household_id: ctx.household.id,
    p_from: from,
    p_to: to,
  });
  if (error) throw new QueryError("monthly", error);
  return (data as Record<string, unknown>[]).map((r) => ({
    month: r.month as CalendarDate,
    income_minor: toMinor(r.income_minor),
    expense_minor: toMinor(r.expense_minor),
  }));
}

export async function getCategoryTotals(
  ctx: HouseholdContext,
  from: CalendarDate,
  to: CalendarDate,
  kind: CategoryKind = "expense",
  rollup = true,
): Promise<CategoryTotalRow[]> {
  const { data, error } = await ctx.supabase.rpc("report_category_totals", {
    p_household_id: ctx.household.id,
    p_from: from,
    p_to: to,
    p_kind: kind,
    p_rollup: rollup,
  });
  if (error) throw new QueryError("category totals", error);
  return (data as Record<string, unknown>[]).map((r) => ({
    category_id: r.category_id as string,
    category_name: r.category_name as string,
    total_minor: toMinor(r.total_minor),
    transaction_count: Number(r.transaction_count),
  }));
}

export async function getAccountHistory(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<AccountHistoryRow[]> {
  const { data, error } = await ctx.supabase.rpc("report_account_history", {
    p_household_id: ctx.household.id,
    p_from: from,
    p_to: to,
  });
  if (error) throw new QueryError("account history", error);
  return (data as Record<string, unknown>[]).map((r) => ({
    month: r.month as CalendarDate,
    assets_minor: toMinor(r.assets_minor),
    liabilities_minor: toMinor(r.liabilities_minor),
  }));
}

export async function getBudgetProgress(ctx: HouseholdContext, month: CalendarDate): Promise<BudgetProgressRow[]> {
  const { data, error } = await ctx.supabase.rpc("budget_progress", {
    p_household_id: ctx.household.id,
    p_month: month,
  });
  if (error) throw new QueryError("budget", error);
  return (data as Record<string, unknown>[]).map((r) => ({
    allocation_id: (r.allocation_id as string) ?? null,
    category_id: (r.category_id as string) ?? null,
    category_name: r.category_name as string,
    parent_id: (r.parent_id as string) ?? null,
    allocated_minor: toMinor(r.allocated_minor),
    carried_in_minor: toMinor(r.carried_in_minor),
    spent_minor: toMinor(r.spent_minor),
    carry_forward: Boolean(r.carry_forward),
  }));
}

export async function getBudgetMonths(ctx: HouseholdContext): Promise<CalendarDate[]> {
  const { data, error } = await ctx.supabase
    .from("budgets")
    .select("month")
    .eq("household_id", ctx.household.id)
    .order("month", { ascending: false })
    .limit(36);
  if (error) throw new QueryError("budget months", error);
  return data.map((r) => r.month as CalendarDate);
}

const RECURRING_COLUMNS =
  "id, direction, name, bill_type, amount_minor, is_variable_amount, currency, frequency, interval_count, anchor_date, next_due_date, end_date, account_id, category_id, liability_account_id, payee, person_user_id, autopay, reminder_days_before, is_active, notes";

function normaliseRecurring(r: Record<string, unknown>): RecurringItem {
  return { ...(r as RecurringItem), amount_minor: toMinor(r.amount_minor) };
}

export async function getRecurringItems(ctx: HouseholdContext, options: { includeInactive?: boolean } = {}): Promise<RecurringItem[]> {
  let query = ctx.supabase
    .from("recurring_items")
    .select(RECURRING_COLUMNS)
    .eq("household_id", ctx.household.id)
    .order("next_due_date");
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new QueryError("recurring items", error);
  return data.map(normaliseRecurring);
}

export async function getRecurringItem(ctx: HouseholdContext, id: string): Promise<RecurringItem | null> {
  const { data, error } = await ctx.supabase
    .from("recurring_items")
    .select(RECURRING_COLUMNS)
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new QueryError("recurring item", error);
  return data ? normaliseRecurring(data) : null;
}

export async function getRecurringPayments(ctx: HouseholdContext, recurringId: string, limit = 24): Promise<RecurringPayment[]> {
  const { data, error } = await ctx.supabase
    .from("recurring_payments")
    .select("id, recurring_id, due_date, status, paid_on, amount_minor, transaction_id, notes, created_by, created_at")
    .eq("household_id", ctx.household.id)
    .eq("recurring_id", recurringId)
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw new QueryError("payments", error);
  return data.map((r) => ({ ...(r as RecurringPayment), amount_minor: r.amount_minor === null ? null : toMinor(r.amount_minor) }));
}

/** Category plus its subcategories, for filtering by a parent category. */
export function categoryWithChildren(categories: Category[], id: string): string[] {
  return [id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)];
}
