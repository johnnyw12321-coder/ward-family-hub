import Decimal from "decimal.js";
import { progressPercent, projectGoal, type GoalProjection } from "@/lib/finance/calculations";
import type { CalendarDate } from "@/lib/dates";

export type ProgressSource = "manual" | "contributions" | "account_balance" | "debt_payoff" | "milestones";

export type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  progress_source: ProgressSource;
  target_minor: number | null;
  target_value: string | null;
  unit: string | null;
  start_minor: number;
  current_minor: number;
  current_value: string;
  linked_account_id: string | null;
  start_date: CalendarDate;
  target_date: CalendarDate | null;
  assigned_user_id: string | null;
  priority: "low" | "medium" | "high";
  status: "not_started" | "in_progress" | "on_hold" | "completed" | "cancelled";
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type GoalInputs = {
  /** Signed ledger balance of the linked account (liabilities negative). */
  accountBalanceMinor?: number;
  contributionsMinor?: number;
  milestones?: { total: number; done: number };
};

export type GoalProgress = {
  kind: "money" | "number" | "count";
  current: number;
  target: number;
  /** Progress at the start, used for pace-based projections. */
  baseline: number;
  percent: number;
  unit: string | null;
};

/**
 * Current progress for a goal from its configured source. Money values are
 * minor units; "number" goals use the stored numeric value as a decimal.
 */
export function goalProgress(goal: GoalRow, inputs: GoalInputs): GoalProgress {
  const money = (current: number, baseline = 0): GoalProgress => {
    const target = goal.target_minor ?? 0;
    return { kind: "money", current, target, baseline, percent: progressPercent(0, current, target), unit: null };
  };
  switch (goal.progress_source) {
    case "contributions":
      return money(inputs.contributionsMinor ?? 0);
    case "account_balance":
      // Baseline = the balance when the goal started, so pace reflects new saving only.
      return money(inputs.accountBalanceMinor ?? 0, goal.start_minor);
    case "debt_payoff": {
      // start_minor is what was owed at the start; progress is how much has been paid down.
      const owedNow = Math.max(0, -(inputs.accountBalanceMinor ?? 0));
      const target = goal.target_minor ?? goal.start_minor;
      const paid = Math.max(0, goal.start_minor - owedNow);
      return { kind: "money", current: paid, target, baseline: 0, percent: progressPercent(0, paid, target), unit: null };
    }
    case "milestones": {
      const m = inputs.milestones ?? { total: 0, done: 0 };
      return { kind: "count", current: m.done, target: m.total, baseline: 0, percent: progressPercent(0, m.done, m.total), unit: "milestones" };
    }
    default: {
      if (goal.target_minor !== null) return money(goal.current_minor);
      const target = new Decimal(goal.target_value ?? 0);
      const current = new Decimal(goal.current_value ?? 0);
      return {
        kind: "number",
        current: current.toNumber(),
        target: target.toNumber(),
        baseline: 0,
        percent: target.lte(0) ? 0 : Math.min(100, Math.max(0, current.div(target).times(100).toDecimalPlaces(1).toNumber())),
        unit: goal.unit,
      };
    }
  }
}

export function goalProjection(goal: GoalRow, progress: GoalProgress, today: CalendarDate): GoalProjection | null {
  if (goal.status === "completed" || goal.status === "cancelled") return null;
  if (progress.kind === "count") return null;
  return projectGoal({
    startDate: goal.start_date,
    today,
    startValue: progress.baseline,
    currentValue: progress.current,
    targetValue: progress.target,
    targetDate: goal.target_date,
  });
}

export const GOAL_CATEGORY_LABELS: Record<string, string> = {
  savings: "Savings",
  debt: "Debt payoff",
  purchase: "Big purchase",
  home: "Home",
  vehicle: "Vehicle",
  family: "Family",
  health: "Health",
  education: "Education",
  travel: "Travel",
  career: "Career",
  net_worth: "Net worth",
  other: "Other",
};

export const GOAL_SOURCE_LABELS: Record<ProgressSource, string> = {
  manual: "I'll update progress myself",
  contributions: "Track contributions I record",
  account_balance: "Follow a savings account's balance",
  debt_payoff: "Follow a debt being paid down",
  milestones: "Count completed milestones",
};

export const GOAL_STATUS_LABELS: Record<GoalRow["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
