/**
 * Pure financial calculations used by the UI. Inputs and outputs are integer
 * minor units; rates use decimal.js. Totals themselves always come from the
 * database ledger — these helpers interpret them.
 */
import Decimal from "decimal.js";
import { addMonths, diffDays, type CalendarDate } from "@/lib/dates";
import { assertMinor, percentOf, type Minor } from "@/lib/money";

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export const ACCOUNT_TYPES = [
  "cash", "chequing", "savings", "credit_card", "loan", "mortgage",
  "line_of_credit", "investment", "other_asset", "other_liability",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  chequing: "Chequing",
  savings: "Savings",
  credit_card: "Credit card",
  loan: "Loan",
  mortgage: "Mortgage",
  line_of_credit: "Line of credit",
  investment: "Investment",
  other_asset: "Other asset",
  other_liability: "Other liability",
};

const LIABILITY_TYPES = new Set<AccountType>(["credit_card", "loan", "mortgage", "line_of_credit", "other_liability"]);
const LIQUID_TYPES = new Set<AccountType>(["cash", "chequing"]);

export function isLiability(type: AccountType): boolean {
  return LIABILITY_TYPES.has(type);
}

/** Liability balances are stored negative; show them as a positive "owed" amount. */
export function displayBalance(type: AccountType, balanceMinor: Minor): Minor {
  return isLiability(type) ? -balanceMinor : balanceMinor;
}

export type AccountWithBalance = {
  type: AccountType;
  balance_minor: Minor;
  include_in_net_worth: boolean;
  is_archived: boolean;
};

export type BalanceSummary = {
  availableCash: Minor;
  savings: Minor;
  totalAssets: Minor;
  totalLiabilities: Minor;
  netWorth: Minor;
};

export function summariseBalances(accounts: AccountWithBalance[], extraAssets: Minor = 0): BalanceSummary {
  let availableCash = 0;
  let savings = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const a of accounts) {
    assertMinor(a.balance_minor);
    if (LIQUID_TYPES.has(a.type) && !a.is_archived) availableCash += a.balance_minor;
    if ((a.type === "savings" || a.type === "investment") && !a.is_archived) savings += a.balance_minor;
    if (!a.include_in_net_worth) continue;
    if (isLiability(a.type)) totalLiabilities += -a.balance_minor;
    else totalAssets += a.balance_minor;
  }
  totalAssets += extraAssets;
  return { availableCash, savings, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}

/** Credit utilisation percentage, or null when no limit is set. */
export function creditUtilisation(balanceMinor: Minor, limitMinor: Minor | null): number | null {
  if (!limitMinor) return null;
  return percentOf(Math.max(0, -balanceMinor), limitMinor);
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export const BUDGET_WARNING_PERCENT = 80;

export type BudgetLevel = "ok" | "warning" | "over";

export type BudgetStatus = {
  available: Minor; // allocation + carried in
  remaining: Minor; // may be negative
  percentUsed: number;
  level: BudgetLevel;
};

export function budgetStatus(allocated: Minor, carriedIn: Minor, spent: Minor): BudgetStatus {
  assertMinor(allocated);
  assertMinor(carriedIn);
  assertMinor(spent);
  const available = allocated + carriedIn;
  const remaining = available - spent;
  const percentUsed = percentOf(spent, available);
  let level: BudgetLevel = "ok";
  if (spent > available) level = "over";
  else if (available > 0 && percentUsed >= BUDGET_WARNING_PERCENT) level = "warning";
  else if (available === 0 && spent > 0) level = "over";
  return { available, remaining, percentUsed, level };
}

/** The unspent remainder that would carry into next month (never negative). */
export function carryForwardAmount(allocated: Minor, carriedIn: Minor, spent: Minor): Minor {
  return Math.max(0, allocated + carriedIn - spent);
}

/**
 * Where the month should be by now if spending were even, for "on pace"
 * indicators. Returns the percentage of the month elapsed (0-100).
 */
export function monthElapsedPercent(today: CalendarDate, monthStart: CalendarDate): number {
  const nextMonth = addMonths(monthStart, 1);
  const total = diffDays(nextMonth, monthStart);
  const elapsed = Math.min(total, Math.max(0, diffDays(today, monthStart) + 1));
  return new Decimal(elapsed).div(total).times(100).toDecimalPlaces(1).toNumber();
}

// ---------------------------------------------------------------------------
// Period summary
// ---------------------------------------------------------------------------
export type PeriodSummary = {
  income_minor: Minor;
  expense_minor: Minor;
  interest_minor: Minor;
  savings_transfer_minor: Minor;
  debt_principal_minor: Minor;
};

/** Surplus is income minus spending (interest included; transfers excluded). */
export function surplus(summary: Pick<PeriodSummary, "income_minor" | "expense_minor">): Minor {
  return summary.income_minor - summary.expense_minor;
}

/**
 * Savings rate = surplus / income, as a percentage: the share of income not
 * spent (it may be held as cash, saved, or used to pay down debt principal).
 * Negative when spending exceeds income.
 */
export function savingsRate(summary: Pick<PeriodSummary, "income_minor" | "expense_minor">): number | null {
  if (summary.income_minor <= 0) return null;
  return percentOf(surplus(summary), summary.income_minor);
}

/** Percentage change from previous to current; null when there is no baseline. */
export function percentChange(current: Minor, previous: Minor): number | null {
  if (previous === 0) return null;
  return new Decimal(current - previous).div(Math.abs(previous)).times(100).toDecimalPlaces(1).toNumber();
}

// ---------------------------------------------------------------------------
// Debt payoff
// ---------------------------------------------------------------------------
export type PayoffProjection =
  | { status: "paid" }
  | { status: "never"; monthlyInterest: Minor }
  | { status: "ok"; months: number; totalInterest: Minor; payoffMonth: CalendarDate; schedule: PayoffRow[] };

export type PayoffRow = { month: CalendarDate; payment: Minor; interest: Minor; principal: Minor; balance: Minor };

/**
 * Month-by-month amortisation. Interest accrues monthly at APR/12 on the
 * opening balance, rounded half-up to the cent. The final payment is reduced
 * to exactly clear the balance.
 */
export function projectPayoff(params: {
  owedMinor: Minor;
  aprPercent: Decimal.Value | null;
  monthlyPaymentMinor: Minor;
  startMonth: CalendarDate;
  maxMonths?: number;
}): PayoffProjection {
  const { owedMinor, monthlyPaymentMinor, startMonth } = params;
  assertMinor(owedMinor);
  assertMinor(monthlyPaymentMinor);
  if (owedMinor <= 0) return { status: "paid" };
  const monthlyRate = new Decimal(params.aprPercent ?? 0).div(100).div(12);
  const firstInterest = new Decimal(owedMinor).times(monthlyRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (monthlyPaymentMinor <= firstInterest) return { status: "never", monthlyInterest: firstInterest };

  const maxMonths = params.maxMonths ?? 600;
  const schedule: PayoffRow[] = [];
  let balance = owedMinor;
  let totalInterest = 0;
  for (let i = 0; i < maxMonths && balance > 0; i++) {
    const interest = new Decimal(balance).times(monthlyRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const payment = Math.min(monthlyPaymentMinor, balance + interest);
    const principal = payment - interest;
    balance -= principal;
    totalInterest += interest;
    schedule.push({ month: addMonths(startMonth, i), payment, interest, principal, balance });
  }
  if (balance > 0) return { status: "never", monthlyInterest: firstInterest };
  return {
    status: "ok",
    months: schedule.length,
    totalInterest,
    payoffMonth: schedule[schedule.length - 1].month,
    schedule,
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export type GoalProjection =
  | { status: "complete" }
  | { status: "no-progress" }
  | { status: "projected"; date: CalendarDate; onTrack: boolean | null };

/**
 * Linear projection from progress made since the start date. `onTrack` is null
 * when there is no target date.
 */
export function projectGoal(params: {
  startDate: CalendarDate;
  today: CalendarDate;
  startValue: number;
  currentValue: number;
  targetValue: number;
  targetDate: CalendarDate | null;
}): GoalProjection {
  const { startDate, today, startValue, currentValue, targetValue, targetDate } = params;
  const total = targetValue - startValue;
  const done = currentValue - startValue;
  if (total <= 0 || done >= total) return { status: "complete" };
  const elapsedDays = diffDays(today, startDate);
  if (done <= 0 || elapsedDays <= 0) return { status: "no-progress" };
  const daysNeeded = new Decimal(total - done).div(new Decimal(done).div(elapsedDays)).ceil().toNumber();
  const ms = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const date = new Date(ms + daysNeeded * 86_400_000).toISOString().slice(0, 10);
  return { status: "projected", date, onTrack: targetDate ? date <= targetDate : null };
}

/** Progress percentage clamped to 0..100. */
export function progressPercent(startValue: number, currentValue: number, targetValue: number): number {
  const total = targetValue - startValue;
  if (total <= 0) return currentValue >= targetValue ? 100 : 0;
  const pct = new Decimal(currentValue - startValue).div(total).times(100).toDecimalPlaces(1).toNumber();
  return Math.min(100, Math.max(0, pct));
}

// ---------------------------------------------------------------------------
// Recurring commitments
// ---------------------------------------------------------------------------
/** Average monthly cost of a recurring amount (52 weeks / 12 months), half-up to the cent. */
export function monthlyEquivalent(amountMinor: Minor, frequency: "weekly" | "monthly" | "yearly", interval: number): Minor {
  assertMinor(amountMinor);
  const perMonth =
    frequency === "weekly"
      ? new Decimal(amountMinor).times(52).div(12 * interval)
      : frequency === "monthly"
        ? new Decimal(amountMinor).div(interval)
        : new Decimal(amountMinor).div(12 * interval);
  return perMonth.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
