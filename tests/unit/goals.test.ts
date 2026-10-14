import { describe, expect, it } from "vitest";
import { goalProgress, goalProjection, type GoalRow } from "@/features/goals/progress";

const base: GoalRow = {
  id: "g",
  name: "Goal",
  description: null,
  category: "savings",
  progress_source: "manual",
  target_minor: 6_000_000,
  target_value: null,
  unit: null,
  start_minor: 0,
  current_minor: 0,
  current_value: "0",
  linked_account_id: null,
  start_date: "2026-01-01",
  target_date: "2026-12-31",
  assigned_user_id: null,
  priority: "medium",
  status: "in_progress",
  completed_at: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("goal progress", () => {
  it("follows a savings account balance, projecting from new saving only", () => {
    const g = { ...base, progress_source: "account_balance" as const, start_minor: 1_000_000, linked_account_id: "a" };
    const p = goalProgress(g, { accountBalanceMinor: 3_000_000 });
    expect(p).toMatchObject({ current: 3_000_000, target: 6_000_000, percent: 50, baseline: 1_000_000 });
    // +20,000 in 100 days -> 30,000 left needs 150 more days
    expect(goalProjection(g, p, "2026-04-11")).toEqual({ status: "projected", date: "2026-09-08", onTrack: true });
  });

  it("measures debt payoff as the amount paid down", () => {
    const g = { ...base, progress_source: "debt_payoff" as const, start_minor: 8_000_000, target_minor: 8_000_000, linked_account_id: "loan" };
    const p = goalProgress(g, { accountBalanceMinor: -6_000_000 });
    expect(p).toMatchObject({ current: 2_000_000, target: 8_000_000, percent: 25 });
    expect(goalProgress(g, { accountBalanceMinor: 0 }).percent).toBe(100);
  });

  it("sums contributions", () => {
    const p = goalProgress({ ...base, progress_source: "contributions", target_minor: 1_500_000 }, { contributionsMinor: 350_000 });
    expect(p.percent).toBe(23.3);
  });

  it("counts milestones without projecting a date", () => {
    const g = { ...base, progress_source: "milestones" as const, target_minor: null };
    const p = goalProgress(g, { milestones: { total: 4, done: 1 } });
    expect(p).toMatchObject({ kind: "count", percent: 25 });
    expect(goalProjection(g, p, "2026-04-11")).toBeNull();
  });

  it("supports non-money measurable outcomes", () => {
    const g = { ...base, target_minor: null, target_value: "12", current_value: "3", unit: "books" };
    expect(goalProgress(g, {})).toMatchObject({ kind: "number", current: 3, target: 12, percent: 25, unit: "books" });
  });

  it("does not project completed goals", () => {
    const g = { ...base, status: "completed" as const };
    expect(goalProjection(g, goalProgress(g, {}), "2026-04-11")).toBeNull();
  });
});
