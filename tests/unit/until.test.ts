import { describe, expect, it } from "vitest";
import { evaluate, formatResult, isExpression } from "@/lib/calc";
import { needUntil, quickDates, rateForMonth, weekdaysBetween, type UntilBudgetLine, type UntilInput, type UntilRecurring } from "@/features/finance/until";

const line = (o: Partial<UntilBudgetLine>): UntilBudgetLine => ({
  month: "2026-11-01",
  categoryId: "c",
  name: "Line",
  amountMinor: 0,
  rateMinor: null,
  ratePeriod: null,
  ...o,
});

const bill = (o: Partial<UntilRecurring>): UntilRecurring => ({
  id: "b",
  direction: "bill",
  name: "Bill",
  amountMinor: 100_00,
  anchorDate: "2026-01-05",
  nextDueDate: "2026-11-05",
  endDate: null,
  frequency: "monthly",
  intervalCount: 1,
  isActive: true,
  categoryId: null,
  paidByCard: false,
  ...o,
});

const parents = new Map<string, string | null>([
  ["travel", null],
  ["fuel", "transport"],
  ["transport", null],
  ["dining", null],
  ["groceries", null],
  ["internet", "utilities"],
  ["utilities", null],
]);

// Mon 2 Nov 2026 → Fri 13 Nov 2026: 12 days, 10 weekdays.
const base: UntilInput = {
  today: "2026-11-02",
  until: "2026-11-13",
  budget: [],
  recurring: [],
  parentOf: parents,
  availableCashMinor: 0,
};

describe("rate arithmetic (matches public.budget_rate_amount)", () => {
  it("turns rates into a month's amount", () => {
    expect(rateForMonth(30_00, "weekday", "2026-11-01")).toBe(630_00); // 21 weekdays
    expect(rateForMonth(30_00, "weekday", "2026-12-01")).toBe(690_00); // 23 weekdays
    expect(rateForMonth(50_00, "day", "2026-11-01")).toBe(1500_00);
    expect(rateForMonth(200_00, "week", "2026-11-01")).toBe(85714); // 20000 × 30 ÷ 7
    expect(rateForMonth(200_00, "week", "2026-12-01")).toBe(88571);
    expect(rateForMonth(200_00, "week", "2027-02-01")).toBe(800_00);
    expect(rateForMonth(1200_00, "month", "2026-11-01")).toBe(1200_00);
  });

  it("counts weekdays", () => {
    expect(weekdaysBetween("2026-11-02", "2026-11-13")).toBe(10);
    expect(weekdaysBetween("2026-11-07", "2026-11-08")).toBe(0); // a weekend
  });
});

describe("how much we need until a date", () => {
  it("adds up the wife's example: travel a weekday, gas and eating out a week", () => {
    const r = needUntil({
      ...base,
      budget: [
        line({ categoryId: "travel", name: "Travel", rateMinor: 30_00, ratePeriod: "weekday" }),
        line({ categoryId: "fuel", name: "Fuel", rateMinor: 200_00, ratePeriod: "week" }),
        line({ categoryId: "dining", name: "Eating out", rateMinor: 200_00, ratePeriod: "week" }),
      ],
    });
    expect(r).toMatchObject({ days: 12, weekdays: 10 });
    const by = Object.fromEntries(r.lines.map((l) => [l.categoryId, l]));
    expect(by.travel).toMatchObject({ amountMinor: 300_00, units: 10, period: "weekday" });
    expect(by.fuel.amountMinor).toBe(34286); // 200 × 12 ÷ 7
    expect(by.dining.amountMinor).toBe(34286);
    expect(r.totalMinor).toBe(300_00 + 34286 * 2);
  });

  it("spreads a monthly amount over the month's days", () => {
    const r = needUntil({ ...base, budget: [line({ categoryId: "groceries", name: "Groceries", amountMinor: 1200_00 })] });
    expect(r.lines[0]).toMatchObject({ amountMinor: 480_00, period: "month", units: 12, monthDays: 30 });
  });

  it("uses next month's budget across a month end, or this month's if next isn't set", () => {
    const window = { ...base, today: "2026-11-29", until: "2026-12-02" }; // 2 days in Nov, 2 in Dec
    const nov = line({ categoryId: "groceries", amountMinor: 1500_00 }); // 50/day in Nov
    expect(needUntil({ ...window, budget: [nov] }).totalMinor).toBe(100_00 + Math.round((2 * 1500_00) / 31));
    const dec = line({ month: "2026-12-01", categoryId: "groceries", amountMinor: 3100_00 }); // 100/day in Dec
    const r = needUntil({ ...window, budget: [nov, dec] });
    expect(r.totalMinor).toBe(100_00 + 200_00);
    // Different budgets per month are reported month by month.
    expect(r.lines[0].monthRates).toEqual([
      { month: "2026-11-01", rateMinor: 1500_00 },
      { month: "2026-12-01", rateMinor: 3100_00 },
    ]);
    expect(needUntil({ ...window, budget: [nov] }).lines[0].monthRates).toBeNull();
  });

  it("counts unpaid bills in the window, overdue ones too, but not card bills", () => {
    const r = needUntil({
      ...base,
      recurring: [
        bill({ id: "internet", name: "Internet", nextDueDate: "2026-11-05" }),
        bill({ id: "late", name: "Water", nextDueDate: "2026-10-20", anchorDate: "2026-01-20" }),
        bill({ id: "later", name: "Rent", nextDueDate: "2026-11-25", anchorDate: "2026-01-25" }),
        bill({ id: "card", name: "Netflix", nextDueDate: "2026-11-06", paidByCard: true }),
      ],
    });
    expect(r.bills.map((b) => [b.name, b.date, b.overdue])).toEqual([
      ["Water", "2026-10-20", true],
      ["Internet", "2026-11-05", false],
    ]);
    expect(r.cardBillsLeftOut).toBe(1);
    expect(r.billsMinor).toBe(200_00);
  });

  it("counts a bill inside its budget line once, at the larger amount", () => {
    const r = needUntil({
      ...base,
      budget: [line({ categoryId: "utilities", name: "Utilities", amountMinor: 300_00 })], // 120 over 12 days
      recurring: [bill({ id: "internet", name: "Internet", categoryId: "internet", amountMinor: 399_00 })],
    });
    expect(r.bills).toEqual([]);
    expect(r.lines[0]).toMatchObject({ amountMinor: 399_00, fromBudgetMinor: 120_00 });
    expect(r.lines[0].bills.map((b) => b.name)).toEqual(["Internet"]);
    expect(r.totalMinor).toBe(399_00);
  });

  it("compares with cash and income arriving before the date", () => {
    const r = needUntil({
      ...base,
      availableCashMinor: 500_00,
      budget: [line({ categoryId: "travel", rateMinor: 30_00, ratePeriod: "weekday" })],
      recurring: [bill({ id: "pay", direction: "income", name: "Salary", amountMinor: 8000_00, nextDueDate: "2026-11-10", anchorDate: "2026-01-10" })],
    });
    expect(r.income.map((i) => i.name)).toEqual(["Salary"]);
    expect(r.leftOverMinor).toBe(500_00 + 8000_00 - 300_00);
  });

  it("applies what-ifs without saving anything", () => {
    const input = { ...base, budget: [line({ categoryId: "travel", rateMinor: 30_00, ratePeriod: "weekday" as const })] };
    const r = needUntil({ ...input, overrides: new Map([["travel", 40_00]]) });
    expect(r.lines[0]).toMatchObject({ amountMinor: 400_00, rateMinor: 40_00, overridden: true });
    expect(needUntil(input).lines[0].amountMinor).toBe(300_00);
  });

  it("treats a date before today as today", () => {
    expect(needUntil({ ...base, until: "2026-10-01" })).toMatchObject({ until: "2026-11-02", days: 1 });
  });

  it("offers this Friday and the end of the month", () => {
    expect(quickDates("2026-11-02")).toEqual({ friday: "2026-11-06", monthEnd: "2026-11-30" }); // Monday
    expect(quickDates("2026-11-06").friday).toBe("2026-11-13"); // on a Friday: next one
  });
});

describe("sums in amount boxes and the calculator", () => {
  it("works out arithmetic", () => {
    expect(evaluate("30*5")).toBe(150);
    expect(evaluate("200 + 150")).toBe(350);
    expect(evaluate("1,200 + 350")).toBe(1550);
    expect(evaluate("2 + 3 × 4")).toBe(14);
    expect(evaluate("(2 + 3) x 4")).toBe(20);
    expect(evaluate("100 ÷ 3")).toBeCloseTo(33.333, 2);
    expect(evaluate("-5 + 10")).toBe(5);
    expect(evaluate(".5 * 4")).toBe(2);
  });

  it("refuses anything that isn't a sum", () => {
    for (const bad of ["", "abc", "2 +", "(2", "1/0", "alert(1)", "2..3", "1,20"]) expect(evaluate(bad), bad).toBeNull();
  });

  it("knows a sum from a plain number", () => {
    expect(isExpression("30*5")).toBe(true);
    expect(isExpression("200 + 150")).toBe(true);
    expect(isExpression("-25")).toBe(false);
    expect(isExpression("1,200.50")).toBe(false);
    expect(formatResult(100 / 3)).toBe("33.33");
    expect(formatResult(360)).toBe("360");
  });
});
