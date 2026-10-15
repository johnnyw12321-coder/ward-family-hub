/**
 * Planner arithmetic. Every line has its own frequency; totals are shown "per"
 * a period the viewer picks. Conversion goes through how many times a year
 * each frequency happens (52 weeks, 26 fortnights, 12 months...), in decimal,
 * rounded half-up to the cent per line so the rows always add up to the totals.
 */
import Decimal from "decimal.js";
import { assertMinor, type Minor } from "@/lib/money";

export const PLAN_FREQUENCIES = ["weekly", "fortnightly", "monthly", "quarterly", "yearly"] as const;
export type PlanFrequency = (typeof PLAN_FREQUENCIES)[number];

export const PLAN_FREQUENCY_LABELS: Record<PlanFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

/** What a total is "per", e.g. "per month". */
export const PLAN_PERIOD_LABELS: Record<PlanFrequency, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

const PER_YEAR: Record<PlanFrequency, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 };

export type PlanLineKind = "income" | "expense";

export type PlanLine = {
  id: string;
  kind: PlanLineKind;
  label: string;
  amount_minor: Minor;
  frequency: PlanFrequency;
  sort_order: number;
};

/** An amount paid at `from` frequency, expressed per `to` period. */
export function convertAmount(amountMinor: Minor, from: PlanFrequency, to: PlanFrequency): Minor {
  assertMinor(amountMinor);
  if (from === to) return amountMinor;
  return new Decimal(amountMinor).times(PER_YEAR[from]).div(PER_YEAR[to]).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export type PlanTotals = {
  income: Minor;
  expenses: Minor;
  /** income − expenses; negative when the plan is short. */
  leftOver: Minor;
  /** Share of income the expenses use, 0–100+ (null without income). */
  spentPercent: number | null;
};

export function planTotals(lines: Pick<PlanLine, "kind" | "amount_minor" | "frequency">[], per: PlanFrequency): PlanTotals {
  let income = 0;
  let expenses = 0;
  for (const line of lines) {
    const amount = convertAmount(line.amount_minor, line.frequency, per);
    if (line.kind === "income") income += amount;
    else expenses += amount;
  }
  const spentPercent = income > 0 ? new Decimal(expenses).times(100).div(income).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() : null;
  return { income, expenses, leftOver: income - expenses, spentPercent };
}

/**
 * Map a real recurring schedule (bills & income) onto a planner frequency.
 * Schedules the planner can't express exactly (every 3 weeks, every 2 years)
 * fall back to their monthly average.
 */
export function fromRecurring(
  amountMinor: Minor,
  frequency: "weekly" | "monthly" | "yearly",
  interval: number,
): { amount_minor: Minor; frequency: PlanFrequency } {
  if (interval === 1) return { amount_minor: amountMinor, frequency };
  if (frequency === "weekly" && interval === 2) return { amount_minor: amountMinor, frequency: "fortnightly" };
  if (frequency === "monthly" && interval === 3) return { amount_minor: amountMinor, frequency: "quarterly" };
  if (frequency === "monthly" && interval === 12) return { amount_minor: amountMinor, frequency: "yearly" };
  const perYear = frequency === "weekly" ? 52 / interval : frequency === "monthly" ? 12 / interval : 1 / interval;
  return {
    amount_minor: new Decimal(amountMinor).times(perYear).div(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    frequency: "monthly",
  };
}

/** Expense lines offered by the common household list (a salary line per member is added too). */
export const STARTER_EXPENSES: { label: string; frequency: PlanFrequency }[] = [
  { label: "Mortgage / rent", frequency: "monthly" },
  { label: "Groceries", frequency: "weekly" },
  { label: "Car fuel", frequency: "weekly" },
  { label: "Car loan", frequency: "monthly" },
  { label: "Electricity (T&TEC)", frequency: "monthly" },
  { label: "Water (WASA)", frequency: "quarterly" },
  { label: "Internet & phone", frequency: "monthly" },
  { label: "Cooking gas", frequency: "monthly" },
  { label: "Insurance", frequency: "monthly" },
  { label: "Dining out & fun", frequency: "monthly" },
  { label: "Subscriptions", frequency: "monthly" },
  { label: "Savings", frequency: "monthly" },
];
