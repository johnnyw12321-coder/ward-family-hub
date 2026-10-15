import { describe, expect, it } from "vitest";
import { convertAmount, fromRecurring, planTotals } from "@/features/planner/calc";

describe("planner conversions", () => {
  it("converts between frequencies through times-per-year, to the cent", () => {
    expect(convertAmount(100_00, "weekly", "monthly")).toBe(433_33); // 100 × 52 / 12
    expect(convertAmount(100_00, "fortnightly", "monthly")).toBe(216_67); // 100 × 26 / 12
    expect(convertAmount(300_00, "quarterly", "monthly")).toBe(100_00);
    expect(convertAmount(1200_00, "yearly", "monthly")).toBe(100_00);
    expect(convertAmount(5000_00, "monthly", "yearly")).toBe(60000_00);
    expect(convertAmount(5000_00, "monthly", "weekly")).toBe(1153_85); // 5000 × 12 / 52
    expect(convertAmount(123_45, "monthly", "monthly")).toBe(123_45);
  });

  it("totals income and expenses per the chosen period", () => {
    const lines = [
      { kind: "income" as const, amount_minor: 8000_00, frequency: "monthly" as const },
      { kind: "income" as const, amount_minor: 2000_00, frequency: "fortnightly" as const },
      { kind: "expense" as const, amount_minor: 600_00, frequency: "weekly" as const },
      { kind: "expense" as const, amount_minor: 4500_00, frequency: "monthly" as const },
      { kind: "expense" as const, amount_minor: 1200_00, frequency: "yearly" as const },
    ];
    // income 8000 + 4333.33; expenses 2600 + 4500 + 100
    expect(planTotals(lines, "monthly")).toEqual({ income: 12333_33, expenses: 7200_00, leftOver: 5133_33, spentPercent: 58 });
    const yearly = planTotals(lines, "yearly");
    expect(yearly.income).toBe(148000_00);
    expect(yearly.expenses).toBe(86400_00);
  });

  it("reports a shortfall as negative and no percentage without income", () => {
    expect(planTotals([{ kind: "expense", amount_minor: 50_00, frequency: "monthly" }], "monthly")).toEqual({
      income: 0,
      expenses: 50_00,
      leftOver: -50_00,
      spentPercent: null,
    });
  });

  it("maps real bill schedules onto planner frequencies", () => {
    expect(fromRecurring(500_00, "monthly", 1)).toEqual({ amount_minor: 500_00, frequency: "monthly" });
    expect(fromRecurring(4000_00, "weekly", 2)).toEqual({ amount_minor: 4000_00, frequency: "fortnightly" });
    expect(fromRecurring(900_00, "monthly", 3)).toEqual({ amount_minor: 900_00, frequency: "quarterly" });
    expect(fromRecurring(2400_00, "monthly", 12)).toEqual({ amount_minor: 2400_00, frequency: "yearly" });
    // Every 2 months has no planner frequency: use its monthly average.
    expect(fromRecurring(300_00, "monthly", 2)).toEqual({ amount_minor: 150_00, frequency: "monthly" });
    expect(fromRecurring(2400_00, "yearly", 2)).toEqual({ amount_minor: 100_00, frequency: "monthly" });
  });
});
