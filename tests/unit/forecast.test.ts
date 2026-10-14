import { describe, expect, it } from "vitest";
import { safeToSpend, type ForecastItem } from "@/lib/finance/forecast";

const base: Omit<ForecastItem, "direction" | "name" | "amount_minor" | "anchor_date" | "next_due_date"> = {
  end_date: null,
  frequency: "monthly",
  interval_count: 1,
  is_active: true,
  paidByCard: false,
};

const salary: ForecastItem = { ...base, direction: "income", name: "Salary", amount_minor: 2_500_000, anchor_date: "2026-01-25", next_due_date: "2026-10-25" };

describe("safe to spend until payday", () => {
  it("subtracts bills due before the next payday, including overdue ones", () => {
    const r = safeToSpend(
      1_000_000,
      [
        salary,
        { ...base, direction: "bill", name: "T&TEC", amount_minor: 45_000, anchor_date: "2026-01-10", next_due_date: "2026-10-10" }, // overdue
        { ...base, direction: "bill", name: "Daycare", amount_minor: 150_000, anchor_date: "2026-01-20", next_due_date: "2026-10-20" },
        { ...base, direction: "bill", name: "Mortgage", amount_minor: 800_000, anchor_date: "2026-01-28", next_due_date: "2026-10-28" }, // after payday
        { ...base, direction: "bill", name: "Netflix", amount_minor: 9_000, anchor_date: "2026-01-15", next_due_date: "2026-10-15", paidByCard: true },
      ],
      "2026-10-14",
    );
    expect(r).toMatchObject({ payday: "2026-10-25", incomeName: "Salary", billsMinor: 195_000, safeMinor: 805_000 });
    expect(r!.bills.map((b) => b.name)).toEqual(["T&TEC", "Daycare"]);
  });

  it("counts every occurrence of frequent bills before payday", () => {
    const r = safeToSpend(
      500_000,
      [salary, { ...base, direction: "bill", name: "Groceries delivery", amount_minor: 60_000, frequency: "weekly", anchor_date: "2026-10-01", next_due_date: "2026-10-15" }],
      "2026-10-14",
    );
    expect(r!.bills.map((b) => b.date)).toEqual(["2026-10-15", "2026-10-22"]);
    expect(r!.safeMinor).toBe(380_000);
  });

  it("returns null without expected income", () => {
    expect(safeToSpend(100, [{ ...base, direction: "bill", name: "x", amount_minor: 1, anchor_date: "2026-10-20", next_due_date: "2026-10-20" }], "2026-10-14")).toBeNull();
  });

  it("can go negative when bills exceed cash", () => {
    const r = safeToSpend(100_000, [salary, { ...base, direction: "bill", name: "Rent", amount_minor: 300_000, anchor_date: "2026-10-20", next_due_date: "2026-10-20" }], "2026-10-14");
    expect(r!.safeMinor).toBe(-200_000);
  });
});
