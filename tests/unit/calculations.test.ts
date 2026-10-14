import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  carryForwardAmount,
  creditUtilisation,
  displayBalance,
  monthElapsedPercent,
  percentChange,
  progressPercent,
  projectGoal,
  projectPayoff,
  savingsRate,
  summariseBalances,
  surplus,
} from "@/lib/finance/calculations";

describe("balances", () => {
  it("summarises cash, savings, assets, liabilities and net worth", () => {
    const s = summariseBalances(
      [
        { type: "chequing", balance_minor: 500_000, include_in_net_worth: true, is_archived: false },
        { type: "cash", balance_minor: 20_000, include_in_net_worth: true, is_archived: false },
        { type: "savings", balance_minor: 1_000_000, include_in_net_worth: true, is_archived: false },
        { type: "credit_card", balance_minor: -150_000, include_in_net_worth: true, is_archived: false },
        { type: "mortgage", balance_minor: -90_000_000, include_in_net_worth: true, is_archived: false },
        { type: "chequing", balance_minor: 999, include_in_net_worth: false, is_archived: true },
      ],
      120_000_000, // property value
    );
    expect(s.availableCash).toBe(520_000);
    expect(s.savings).toBe(1_000_000);
    expect(s.totalAssets).toBe(500_000 + 20_000 + 1_000_000 + 120_000_000);
    expect(s.totalLiabilities).toBe(90_150_000);
    expect(s.netWorth).toBe(121_520_000 - 90_150_000);
  });

  it("shows liabilities as amounts owed", () => {
    expect(displayBalance("credit_card", -150_000)).toBe(150_000);
    expect(displayBalance("savings", 150_000)).toBe(150_000);
    expect(creditUtilisation(-250_000, 1_000_000)).toBe(25);
    expect(creditUtilisation(-250_000, null)).toBeNull();
  });
});

describe("budgets", () => {
  it("classifies progress levels", () => {
    expect(budgetStatus(100_000, 0, 50_000)).toMatchObject({ level: "ok", remaining: 50_000, percentUsed: 50 });
    expect(budgetStatus(100_000, 0, 80_000).level).toBe("warning");
    expect(budgetStatus(100_000, 0, 100_000).level).toBe("warning");
    expect(budgetStatus(100_000, 0, 100_001)).toMatchObject({ level: "over", remaining: -1 });
    expect(budgetStatus(100_000, 20_000, 110_000)).toMatchObject({ level: "warning", available: 120_000 });
    expect(budgetStatus(0, 0, 500).level).toBe("over");
  });

  it("carries forward only unspent amounts", () => {
    expect(carryForwardAmount(300_000, 0, 200_000)).toBe(100_000);
    expect(carryForwardAmount(300_000, 50_000, 400_000)).toBe(0);
  });

  it("measures month progress", () => {
    expect(monthElapsedPercent("2026-10-01", "2026-10-01")).toBe(3.2);
    expect(monthElapsedPercent("2026-10-31", "2026-10-01")).toBe(100);
  });
});

describe("period summary", () => {
  it("computes surplus and savings rate", () => {
    const s = { income_minor: 2_000_000, expense_minor: 1_500_000 };
    expect(surplus(s)).toBe(500_000);
    expect(savingsRate(s)).toBe(25);
    expect(savingsRate({ income_minor: 0, expense_minor: 10 })).toBeNull();
    expect(savingsRate({ income_minor: 100, expense_minor: 150 })).toBe(-50);
  });

  it("computes percentage change", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(80, 0)).toBeNull();
  });
});

describe("debt payoff", () => {
  it("amortises a loan to zero with exact cents", () => {
    const p = projectPayoff({ owedMinor: 1_000_000, aprPercent: "12", monthlyPaymentMinor: 100_000, startMonth: "2026-11-01" });
    expect(p.status).toBe("ok");
    if (p.status !== "ok") return;
    expect(p.months).toBe(11);
    const principal = p.schedule.reduce((a, r) => a + r.principal, 0);
    expect(principal).toBe(1_000_000);
    expect(p.schedule.at(-1)!.balance).toBe(0);
    expect(p.totalInterest).toBe(p.schedule.reduce((a, r) => a + r.interest, 0));
    expect(p.totalInterest).toBe(58_985); // verified independently with Python Decimal
    expect(p.payoffMonth).toBe("2027-09-01");
  });

  it("handles interest-free debts", () => {
    const p = projectPayoff({ owedMinor: 300_000, aprPercent: null, monthlyPaymentMinor: 100_000, startMonth: "2026-11-01" });
    expect(p).toMatchObject({ status: "ok", months: 3, totalInterest: 0 });
  });

  it("detects payments that never pay off the debt", () => {
    const p = projectPayoff({ owedMinor: 10_000_000, aprPercent: "24", monthlyPaymentMinor: 200_000, startMonth: "2026-11-01" });
    expect(p).toEqual({ status: "never", monthlyInterest: 200_000 });
  });

  it("reports paid-off debts", () => {
    expect(projectPayoff({ owedMinor: 0, aprPercent: "5", monthlyPaymentMinor: 1, startMonth: "2026-11-01" })).toEqual({ status: "paid" });
  });
});

describe("goals", () => {
  it("projects a completion date from the rate of progress", () => {
    const p = projectGoal({
      startDate: "2026-01-01",
      today: "2026-04-11", // 100 days
      startValue: 0,
      currentValue: 1_000_000,
      targetValue: 3_000_000,
      targetDate: "2026-12-31",
    });
    expect(p).toEqual({ status: "projected", date: "2026-10-28", onTrack: true });
  });

  it("flags goals behind schedule and without progress", () => {
    expect(
      projectGoal({ startDate: "2026-01-01", today: "2026-04-11", startValue: 0, currentValue: 100, targetValue: 10_000, targetDate: "2026-06-30" }),
    ).toMatchObject({ onTrack: false });
    expect(
      projectGoal({ startDate: "2026-01-01", today: "2026-04-11", startValue: 0, currentValue: 0, targetValue: 10_000, targetDate: null }),
    ).toEqual({ status: "no-progress" });
  });

  it("supports goals that count down (debt payoff)", () => {
    // Debt goal expressed as amount paid off so far.
    expect(progressPercent(0, 2_500, 10_000)).toBe(25);
    expect(progressPercent(0, 12_000, 10_000)).toBe(100);
  });
});
