/**
 * Expected spending for a month: fixed bills plus budgeted (variable)
 * spending, as one number. Pure so it can be tested without a database.
 *
 * A bill and a budget can describe the same money: a TT$600 electricity bill
 * filed under Utilities, and a TT$800 Utilities budget. A bill whose category
 * (or its parent category) has a budget line is counted inside that line, and
 * the line counts whichever is larger, its budget or its bills, so nothing is
 * counted twice. Every other bill (including loan and mortgage payments) is
 * added on top.
 */
import type { Minor } from "@/lib/money";
import type { MonthGroup } from "./month";

export type ExpectedBudgetLine = {
  allocation_id: string | null;
  category_id: string | null;
  allocated_minor: Minor;
  carried_in_minor: Minor;
  spent_minor: Minor;
};

export type ExpectedSpending = {
  /** Bills + budgets, without double counting. */
  total: Minor;
  /** Bills that no budget line covers. */
  billsMinor: Minor;
  billCount: number;
  /** Budget lines, each at least as large as the bills inside it. */
  budgetMinor: Minor;
  budgetCount: number;
  /** Bills counted inside a budget line instead of on their own. */
  coveredBillCount: number;
};

export function expectedSpending(bills: MonthGroup, budget: ExpectedBudgetLine[], parentOf: Map<string, string | null>): ExpectedSpending {
  const lines = budget.filter((b) => b.allocation_id && b.category_id);
  const lineFor = new Map(lines.map((l) => [l.category_id!, l]));
  const insideLine = new Map<string, Minor>();
  let billsMinor = 0;
  let billCount = 0;
  let coveredBillCount = 0;

  for (const e of bills.entries) {
    if (e.status === "skipped") continue;
    const category = e.item.category_id;
    const parent = category ? (parentOf.get(category) ?? null) : null;
    const line = (category && lineFor.get(category)) || (parent && lineFor.get(parent)) || null;
    if (line) {
      insideLine.set(line.category_id!, (insideLine.get(line.category_id!) ?? 0) + e.amount);
      coveredBillCount++;
    } else {
      billsMinor += e.amount;
      billCount++;
    }
  }

  let budgetMinor = 0;
  for (const l of lines) {
    const available = l.allocated_minor + l.carried_in_minor;
    budgetMinor += Math.max(available, insideLine.get(l.category_id!) ?? 0);
  }

  return { total: billsMinor + budgetMinor, billsMinor, billCount, budgetMinor, budgetCount: lines.length, coveredBillCount };
}
