import { describe, expect, it } from "vitest";
import { monthEntries, type MonthPayment } from "@/features/finance/month";
import type { RecurringItem } from "@/features/finance/types";

const base: RecurringItem = {
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
};
const item = (o: Partial<RecurringItem>): RecurringItem => ({ ...base, ...o });
const MONTH = "2026-10-01";
const TODAY = "2026-10-15";
const summary = (entries: { item: RecurringItem; dueDate: string; status: string; isNext: boolean }[]) =>
  entries.map((e) => `${e.item.id} ${e.dueDate} ${e.status}${e.isNext ? " next" : ""}`);

describe("this month's bills", () => {
  it("lists paid, overdue and upcoming occurrences with the right totals", () => {
    const items = [
      item({ id: "electric", next_due_date: "2026-10-20", amount_minor: 450_00 }),
      item({ id: "internet", anchor_date: "2026-01-05", next_due_date: "2026-11-05", amount_minor: 399_00 }),
      item({ id: "water", anchor_date: "2026-01-10", next_due_date: "2026-10-10", amount_minor: 150_00 }),
    ];
    const payments: MonthPayment[] = [{ recurring_id: "internet", due_date: "2026-10-05", status: "paid", amount_minor: 405_50 }];
    const { bills } = monthEntries(items, payments, MONTH, TODAY);
    expect(summary(bills.entries)).toEqual(["water 2026-10-10 overdue next", "electric 2026-10-20 due next", "internet 2026-10-05 paid"]);
    expect(bills).toMatchObject({ settled: 405_50, outstanding: 600_00, total: 1005_50, overdueCount: 1 });
  });

  it("shows every occurrence of a weekly bill, with only the earliest settleable", () => {
    const groceries = item({ id: "groceries", frequency: "weekly", anchor_date: "2026-10-01", next_due_date: "2026-10-08", amount_minor: 600_00 });
    const payments: MonthPayment[] = [{ recurring_id: "groceries", due_date: "2026-10-01", status: "paid", amount_minor: 580_00 }];
    const { bills } = monthEntries([groceries], payments, MONTH, TODAY);
    expect(summary(bills.entries)).toEqual([
      "groceries 2026-10-08 overdue next",
      "groceries 2026-10-15 due",
      "groceries 2026-10-22 due",
      "groceries 2026-10-29 due",
      "groceries 2026-10-01 paid",
    ]);
    expect(bills.total).toBe(580_00 + 4 * 600_00);
  });

  it("carries over the oldest unpaid occurrence from an earlier month", () => {
    const rent = item({ id: "rent", next_due_date: "2026-08-20" });
    const { bills } = monthEntries([rent], [], MONTH, TODAY);
    expect(summary(bills.entries)).toEqual(["rent 2026-08-20 overdue next", "rent 2026-10-20 due"]);
  });

  it("counts skips as nothing owed, keeps paused items' payments, and respects end dates", () => {
    const items = [
      item({ id: "gym", is_active: false, next_due_date: "2026-11-03", anchor_date: "2026-01-03" }),
      item({ id: "netflix", anchor_date: "2026-01-12", next_due_date: "2026-11-12" }),
      item({ id: "loan", next_due_date: "2026-10-20", end_date: "2026-10-01" }),
    ];
    const payments: MonthPayment[] = [
      { recurring_id: "gym", due_date: "2026-10-03", status: "paid", amount_minor: 300_00 },
      { recurring_id: "netflix", due_date: "2026-10-12", status: "skipped", amount_minor: null },
    ];
    const { bills } = monthEntries(items, payments, MONTH, TODAY);
    expect(summary(bills.entries)).toEqual(["gym 2026-10-03 paid", "netflix 2026-10-12 skipped"]);
    expect(bills).toMatchObject({ settled: 300_00, outstanding: 0, total: 300_00 });
  });

  it("keeps income separate from bills", () => {
    const salary = item({ id: "salary", direction: "income", anchor_date: "2026-01-25", next_due_date: "2026-10-25", amount_minor: 12_500_00 });
    const { bills, income } = monthEntries([salary], [], MONTH, TODAY);
    expect(bills.entries).toHaveLength(0);
    expect(summary(income.entries)).toEqual(["salary 2026-10-25 due next"]);
    expect(income.outstanding).toBe(12_500_00);
  });
});
