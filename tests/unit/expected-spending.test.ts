import { describe, expect, it } from "vitest";
import { expectedSpending, type ExpectedBudgetLine } from "@/features/finance/expected";
import type { MonthEntry, MonthGroup } from "@/features/finance/month";
import type { RecurringItem } from "@/features/finance/types";
import { REMINDER_INFO, reminderKey } from "@/features/notifications/reminders";

const item = (o: Partial<RecurringItem>): RecurringItem => ({
  id: "x",
  direction: "bill",
  name: "Bill",
  bill_type: "utility",
  amount_minor: 100_00,
  is_variable_amount: false,
  currency: "TTD",
  frequency: "monthly",
  interval_count: 1,
  anchor_date: "2026-01-20",
  next_due_date: "2026-10-20",
  end_date: null,
  account_id: null,
  category_id: null,
  liability_account_id: null,
  payee: null,
  person_user_id: null,
  autopay: false,
  reminder_days_before: 3,
  is_active: true,
  notes: null,
  ...o,
});

const entry = (o: Partial<RecurringItem>, amount: number, status: MonthEntry["status"] = "due"): MonthEntry => ({
  item: item(o),
  dueDate: "2026-10-20",
  status,
  amount,
  isNext: true,
});

const group = (entries: MonthEntry[]): MonthGroup => ({ entries, total: 0, settled: 0, outstanding: 0, overdueCount: 0 });

const line = (category_id: string, allocated: number, spent = 0): ExpectedBudgetLine => ({
  allocation_id: `a-${category_id}`,
  category_id,
  allocated_minor: allocated,
  carried_in_minor: 0,
  spent_minor: spent,
});

// Utilities (parent) → Electricity (sub); Groceries on its own.
const parents = new Map<string, string | null>([
  ["utilities", null],
  ["electricity", "utilities"],
  ["groceries", null],
  ["mortgage", null],
]);

describe("expected spending", () => {
  it("adds fixed bills and variable budgets into one total", () => {
    const r = expectedSpending(group([entry({ category_id: "mortgage" }, 5000_00)]), [line("groceries", 2500_00)], parents);
    expect(r).toMatchObject({ total: 7500_00, billsMinor: 5000_00, billCount: 1, budgetMinor: 2500_00, budgetCount: 1, coveredBillCount: 0 });
  });

  it("counts a bill inside a budget for the same category, using the larger amount", () => {
    // TT$600 electricity bill under a TT$800 Electricity budget → TT$800, not TT$1,400.
    const r = expectedSpending(group([entry({ category_id: "electricity" }, 600_00)]), [line("electricity", 800_00)], parents);
    expect(r.total).toBe(800_00);
    expect(r.coveredBillCount).toBe(1);
    // A bill bigger than its budget: the bill wins.
    expect(expectedSpending(group([entry({ category_id: "electricity" }, 900_00)]), [line("electricity", 800_00)], parents).total).toBe(900_00);
  });

  it("matches a bill on a subcategory to a budget on its parent", () => {
    const r = expectedSpending(group([entry({ category_id: "electricity" }, 600_00)]), [line("utilities", 800_00)], parents);
    expect(r).toMatchObject({ total: 800_00, coveredBillCount: 1, billsMinor: 0 });
  });

  it("adds up several bills inside one budget line", () => {
    const bills = group([entry({ id: "a", category_id: "electricity" }, 500_00), entry({ id: "b", category_id: "utilities" }, 400_00)]);
    expect(expectedSpending(bills, [line("utilities", 800_00)], parents).total).toBe(900_00);
  });

  it("leaves out skipped bills and keeps loan payments as bills", () => {
    const bills = group([
      entry({ id: "skip", category_id: "electricity" }, 0, "skipped"),
      entry({ id: "loan", category_id: null, liability_account_id: "car-loan" }, 3100_00, "paid"),
    ]);
    const r = expectedSpending(bills, [line("utilities", 800_00)], parents);
    expect(r).toMatchObject({ total: 3900_00, billsMinor: 3100_00, billCount: 1, coveredBillCount: 0 });
  });

  it("ignores spending outside the budget (no allocation)", () => {
    const outside: ExpectedBudgetLine = { allocation_id: null, category_id: null, allocated_minor: 0, carried_in_minor: 0, spent_minor: 999_00 };
    expect(expectedSpending(group([]), [outside, line("groceries", 100_00)], parents).total).toBe(100_00);
  });
});

describe("reminder keys", () => {
  const id = "3f2a6c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
  it("reads the item from a notification's key", () => {
    expect(reminderKey(`bill:${id}:2026-10-20:due`)).toEqual({ source: "bill", keyId: id });
    expect(reminderKey(`vehicle:${id}:insurance:2026-11-01`)).toEqual({ source: "vehicle", keyId: id });
    expect(reminderKey(`budget:${id}:2026-10-01:80`)).toEqual({ source: "budget", keyId: id });
  });

  it("ignores keys that aren't item reminders", () => {
    expect(reminderKey("daily_log:2026-10-20")).toBeNull();
    expect(reminderKey("bill:not-a-uuid:2026")).toBeNull();
    expect(reminderKey("")).toBeNull();
  });

  it("offers timing choices for every date-based reminder", () => {
    for (const [source, info] of Object.entries(REMINDER_INFO)) {
      if (source === "budget") expect(info.leads).toBeNull();
      else expect(info.leads!.length, source).toBeGreaterThan(1);
    }
    // Event choices must be ones the calendar can store.
    expect(REMINDER_INFO.event.leads!.map((l) => l.value)).toEqual([0, 1, 2, 7]);
  });
});
