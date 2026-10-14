import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, categoryId, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let chequing: string;
let savings: string;
let card: string;
let carLoan: string;

const J = () => f.jonathan;

async function create(tx: Transaction, name: string, type: string, opening = 0): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `select public.create_account(p_household_id => $1, p_name => $2, p_type => $3::public.account_type,
       p_opening_balance_minor => $4, p_opening_date => '2026-01-01T12:00:00Z') as id`,
    [f.householdA, name, type, opening],
  );
  return r.rows[0].id;
}

async function balance(accountId: string): Promise<number> {
  const r = await db.query<{ balance_minor: number }>(
    `select balance_minor from public.account_balances where account_id = $1`,
    [accountId],
  );
  return Number(r.rows[0].balance_minor);
}

async function save(params: Record<string, unknown>): Promise<string> {
  const keys = Object.keys(params);
  const args = keys.map((k, i) => `${k} => $${i + 2}`).join(", ");
  return asUser(db, J(), async (tx) => {
    const r = await tx.query<{ id: string }>(
      `select public.save_transaction(p_household_id => $1, ${args}) as id`,
      [f.householdA, ...keys.map((k) => params[k])],
    );
    return r.rows[0].id;
  });
}

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  await asUser(db, J(), async (tx) => {
    chequing = await create(tx, "Chequing", "chequing", 1_000_000); // TT$10,000.00
    savings = await create(tx, "Savings", "savings", 0);
    card = await create(tx, "Visa", "credit_card", 0);
    carLoan = await create(tx, "Car Loan", "loan", -8_000_000); // owe TT$80,000
  });
});

describe("account balances", () => {
  it("derives opening balances from the ledger", async () => {
    expect(await balance(chequing)).toBe(1_000_000);
    expect(await balance(carLoan)).toBe(-8_000_000);
  });

  it("does not double count a credit card purchase and its repayment", async () => {
    const groceries = await categoryId(db, f.householdA, "Groceries");
    await save({
      p_kind: "expense", p_amount_minor: 50_000, p_account_id: card,
      p_occurred_at: "2026-02-05T15:00:00Z", p_description: "Massy Stores", p_category_id: groceries,
      p_payment_method: "credit_card",
    });
    await save({
      p_kind: "transfer", p_amount_minor: 50_000, p_account_id: chequing, p_to_account_id: card,
      p_occurred_at: "2026-02-20T15:00:00Z", p_description: "Pay Visa",
    });
    expect(await balance(card)).toBe(0);
    expect(await balance(chequing)).toBe(950_000);

    const r = await asUser(db, J(), (tx) =>
      tx.query<{ expense_minor: number; debt_principal_minor: number }>(
        `select * from public.report_summary($1, '2026-02-01', '2026-02-28')`,
        [f.householdA],
      ),
    );
    expect(Number(r.rows[0].expense_minor)).toBe(50_000); // spent once
    expect(Number(r.rows[0].debt_principal_minor)).toBe(50_000); // repayment is not spending
  });

  it("treats a refund as negative spending", async () => {
    const dining = await categoryId(db, f.householdA, "Dining Out");
    await save({
      p_kind: "expense", p_amount_minor: 10_000, p_account_id: chequing,
      p_occurred_at: "2026-03-02T15:00:00Z", p_description: "Dinner", p_category_id: dining,
    });
    await save({
      p_kind: "expense", p_amount_minor: 2_500, p_account_id: chequing, p_is_refund: true,
      p_occurred_at: "2026-03-03T15:00:00Z", p_description: "Dinner refund", p_category_id: dining,
    });
    const r = await asUser(db, J(), (tx) =>
      tx.query<{ total_minor: number }>(
        `select total_minor from public.report_category_totals($1, '2026-03-01', '2026-03-31', 'expense', true)
         where category_name = 'Food'`,
        [f.householdA],
      ),
    );
    expect(Number(r.rows[0].total_minor)).toBe(7_500);
  });
});

describe("ledger integrity", () => {
  it("rejects an unbalanced transfer written directly", async () => {
    await expect(
      asUser(db, J(), async (tx) => {
        const t = await tx.query<{ id: string }>(
          `insert into public.transactions (household_id, kind, occurred_on, description)
           values ($1, 'transfer', current_date, 'bad') returning id`,
          [f.householdA],
        );
        await tx.query(
          `insert into public.transaction_entries (household_id, transaction_id, account_id, amount_minor)
           values ($1, $2, $3, -100), ($1, $2, $4, 90)`,
          [f.householdA, t.rows[0].id, chequing, savings],
        );
      }),
    ).rejects.toThrow(/balance to zero/);
  });

  it("rejects a transfer to the same account", async () => {
    await expect(
      save({
        p_kind: "transfer", p_amount_minor: 100, p_account_id: chequing, p_to_account_id: chequing,
        p_occurred_at: "2026-03-01T12:00:00Z", p_description: "loop",
      }),
    ).rejects.toThrow(/two different accounts/);
  });

  it("rejects zero, negative and mismatched-category amounts", async () => {
    const salary = await categoryId(db, f.householdA, "Employment Income");
    await expect(
      save({ p_kind: "expense", p_amount_minor: 0, p_account_id: chequing, p_occurred_at: "2026-03-01", p_description: "x" }),
    ).rejects.toThrow(/zero/);
    await expect(
      save({ p_kind: "expense", p_amount_minor: -5, p_account_id: chequing, p_occurred_at: "2026-03-01", p_description: "x" }),
    ).rejects.toThrow(/positive/);
    await expect(
      save({
        p_kind: "expense", p_amount_minor: 500, p_account_id: chequing, p_occurred_at: "2026-03-01",
        p_description: "x", p_category_id: salary,
      }),
    ).rejects.toThrow(/does not match/);
  });

  it("requires a category for income and expenses", async () => {
    await expect(
      save({ p_kind: "expense", p_amount_minor: 500, p_account_id: chequing, p_occurred_at: "2026-03-01", p_description: "x" }),
    ).rejects.toThrow(/check constraint/);
  });

  it("updates a transaction in place, replacing its entries atomically", async () => {
    const fuel = await categoryId(db, f.householdA, "Fuel");
    const before = await balance(chequing);
    const id = await save({
      p_kind: "expense", p_amount_minor: 30_000, p_account_id: chequing, p_occurred_at: "2026-03-10T12:00:00Z",
      p_description: "NP Fuel", p_category_id: fuel,
    });
    await save({
      p_transaction_id: id, p_kind: "expense", p_amount_minor: 32_500, p_account_id: chequing,
      p_occurred_at: "2026-03-10T12:00:00Z", p_description: "NP Fuel (corrected)", p_category_id: fuel,
    });
    expect(await balance(chequing)).toBe(before - 32_500);
    const n = await db.query<{ n: number }>(`select count(*)::int n from public.transaction_entries where transaction_id = $1`, [id]);
    expect(n.rows[0].n).toBe(1);
  });

  it("stores the local date in the household timezone (America/Port_of_Spain, UTC-4)", async () => {
    const misc = await categoryId(db, f.householdA, "Miscellaneous");
    const id = await save({
      p_kind: "expense", p_amount_minor: 100, p_account_id: chequing,
      p_occurred_at: "2026-04-01T02:30:00Z", // 31 Mar 22:30 local
      p_description: "Late night", p_category_id: misc,
    });
    const r = await db.query<{ d: string }>(`select occurred_on::text d from public.transactions where id = $1`, [id]);
    expect(r.rows[0].d).toBe("2026-03-31");
  });
});

describe("classification", () => {
  it("separates income, savings transfers, debt principal and interest", async () => {
    const salary = await categoryId(db, f.householdA, "Employment Income");
    await save({
      p_kind: "income", p_amount_minor: 2_500_000, p_account_id: chequing, p_occurred_at: "2026-05-25T12:00:00Z",
      p_description: "Salary", p_category_id: salary,
    });
    await save({
      p_kind: "transfer", p_amount_minor: 300_000, p_account_id: chequing, p_to_account_id: savings,
      p_occurred_at: "2026-05-26T12:00:00Z", p_description: "Emergency fund",
    });
    await asUser(db, J(), (tx) =>
      tx.query(
        `select public.record_debt_payment($1, $2, $3, 250000, 45000, '2026-05-27T12:00:00Z', 'Car loan')`,
        [f.householdA, chequing, carLoan],
      ),
    );

    const r = await asUser(db, J(), (tx) =>
      tx.query<Record<string, number>>(`select * from public.report_summary($1, '2026-05-01', '2026-05-31')`, [
        f.householdA,
      ]),
    );
    const s = Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)]));
    expect(s).toMatchObject({
      income_minor: 2_500_000,
      expense_minor: 45_000, // only the interest is spending
      interest_minor: 45_000,
      savings_transfer_minor: 300_000,
      debt_principal_minor: 250_000,
    });
    expect(await balance(carLoan)).toBe(-8_000_000 + 250_000);
  });

  it("produces month-by-month totals including empty months", async () => {
    const r = await asUser(db, J(), (tx) =>
      tx.query<{ month: string; income_minor: number; expense_minor: number }>(
        `select month::text, income_minor, expense_minor from public.report_monthly($1, '2026-04-01', '2026-06-30')`,
        [f.householdA],
      ),
    );
    expect(r.rows.map((x) => x.month)).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
    expect(Number(r.rows[1].income_minor)).toBe(2_500_000);
    expect(Number(r.rows[2].expense_minor)).toBe(0);
  });

  it("tracks month-end assets and liabilities for net worth", async () => {
    const r = await asUser(db, J(), (tx) =>
      tx.query<{ month: string; assets_minor: number; liabilities_minor: number }>(
        `select month::text, assets_minor, liabilities_minor from public.report_account_history($1, '2026-01-01', '2026-01-31')`,
        [f.householdA],
      ),
    );
    expect(Number(r.rows[0].assets_minor)).toBe(1_000_000);
    expect(Number(r.rows[0].liabilities_minor)).toBe(8_000_000);
  });
});

describe("reconciliation", () => {
  it("posts an adjustment for the difference and marks entries reconciled", async () => {
    const before = await balance(savings);
    const r = await asUser(db, J(), (tx) =>
      tx.query<{ diff: number }>(
        `select public.reconcile_account($1, $2, $3, '2026-06-30T23:59:00Z') as diff`,
        [f.householdA, savings, before + 1_234],
      ),
    );
    expect(Number(r.rows[0].diff)).toBe(1_234);
    expect(await balance(savings)).toBe(before + 1_234);
    const pending = await db.query<{ n: number }>(
      `select count(*)::int n from public.transaction_entries where account_id = $1 and status <> 'reconciled'`,
      [savings],
    );
    expect(pending.rows[0].n).toBe(0);
  });
});

describe("budgets", () => {
  it("attributes spending to the most specific budgeted category and carries forward unspent amounts", async () => {
    const food = await categoryId(db, f.householdA, "Food");
    const groceries = await categoryId(db, f.householdA, "Groceries");
    const dining = await categoryId(db, f.householdA, "Dining Out");
    const fuel = await categoryId(db, f.householdA, "Fuel");

    await asUser(db, J(), async (tx) => {
      const b = await tx.query<{ id: string }>(
        `insert into public.budgets (household_id, month) values ($1, '2026-07-01') returning id`,
        [f.householdA],
      );
      await tx.query(
        `insert into public.budget_allocations (household_id, budget_id, category_id, amount_minor, carry_forward)
         values ($1, $2, $3, 300000, true), ($1, $2, $4, 100000, false)`,
        [f.householdA, b.rows[0].id, groceries, food],
      );
    });
    // Groceries 2,000 -> groceries allocation; Dining 400 -> parent Food allocation; Fuel 150 -> unbudgeted
    for (const [cat, amt] of [[groceries, 200_000], [dining, 40_000], [fuel, 15_000]] as const) {
      await save({
        p_kind: "expense", p_amount_minor: amt, p_account_id: chequing, p_occurred_at: "2026-07-15T12:00:00Z",
        p_description: "spend", p_category_id: cat,
      });
    }

    const rows = await asUser(db, J(), (tx) =>
      tx.query<{ category_id: string | null; spent_minor: number; allocated_minor: number }>(
        `select * from public.budget_progress($1, '2026-07-01')`,
        [f.householdA],
      ),
    );
    const byCat = new Map(rows.rows.map((r) => [r.category_id, Number(r.spent_minor)]));
    expect(byCat.get(groceries)).toBe(200_000);
    expect(byCat.get(food)).toBe(40_000);
    expect(byCat.get(null)).toBe(15_000);

    await asUser(db, J(), (tx) => tx.query(`select public.copy_budget($1, '2026-07-01', '2026-08-01')`, [f.householdA]));
    const next = await db.query<{ category_id: string; amount_minor: number; carried_in_minor: number }>(
      `select a.category_id, a.amount_minor, a.carried_in_minor from public.budget_allocations a
       join public.budgets b on b.id = a.budget_id where b.month = '2026-08-01'`,
    );
    const g = next.rows.find((r) => r.category_id === groceries)!;
    const fd = next.rows.find((r) => r.category_id === food)!;
    expect(Number(g.amount_minor)).toBe(300_000);
    expect(Number(g.carried_in_minor)).toBe(100_000); // 3,000 - 2,000 unspent carried
    expect(Number(fd.carried_in_minor)).toBe(0); // carry_forward off
  });

  it("refuses to budget income categories", async () => {
    const salary = await categoryId(db, f.householdA, "Employment Income");
    await expect(
      asUser(db, J(), async (tx) => {
        const b = await tx.query<{ id: string }>(`select id from public.budgets where month = '2026-07-01'`);
        await tx.query(
          `insert into public.budget_allocations (household_id, budget_id, category_id, amount_minor) values ($1, $2, $3, 1)`,
          [f.householdA, b.rows[0].id, salary],
        );
      }),
    ).rejects.toThrow(/expense categories/);
  });
});

describe("recurring bills", () => {
  it("computes occurrences from the anchor without drifting", async () => {
    const r = await db.query<{ a: string; b: string; c: string; d: string; e: string }>(`select
      public.next_occurrence_after('2026-01-31', 'monthly', 1, '2026-01-31')::text a,
      public.next_occurrence_after('2026-01-31', 'monthly', 1, '2026-02-28')::text b,
      public.next_occurrence_after('2026-01-15', 'weekly', 2, '2026-01-15')::text c,
      public.next_occurrence_after('2024-02-29', 'yearly', 1, '2024-02-29')::text d,
      public.next_occurrence_after('2026-03-01', 'monthly', 3, '2026-01-01')::text e`);
    expect(r.rows[0]).toEqual({ a: "2026-02-28", b: "2026-03-31", c: "2026-01-29", d: "2025-02-28", e: "2026-03-01" });
  });

  it("records a payment only when asked, then advances the due date", async () => {
    const electricity = await categoryId(db, f.householdA, "Electricity");
    const billId = await asUser(db, J(), async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.recurring_items (household_id, name, bill_type, amount_minor, anchor_date, next_due_date,
           account_id, category_id) values ($1, 'T&TEC', 'utility', 45000, '2026-01-31', '2026-01-31', $2, $3) returning id`,
        [f.householdA, chequing, electricity],
      );
      return r.rows[0].id;
    });
    const before = await balance(chequing);
    await asUser(db, J(), (tx) =>
      tx.query(
        `select public.settle_recurring($1, $2, '2026-01-31', 'paid', p_paid_on => '2026-02-02', p_amount_minor => 47210)`,
        [f.householdA, billId],
      ),
    );
    const item = await db.query<{ next_due_date: string }>(
      `select next_due_date::text from public.recurring_items where id = $1`,
      [billId],
    );
    expect(item.rows[0].next_due_date).toBe("2026-02-28");
    expect(await balance(chequing)).toBe(before - 47_210);

    // Skipping does not post money.
    await asUser(db, J(), (tx) =>
      tx.query(`select public.settle_recurring($1, $2, '2026-02-28', 'skipped')`, [f.householdA, billId]),
    );
    expect(await balance(chequing)).toBe(before - 47_210);
    const again = await db.query<{ next_due_date: string }>(
      `select next_due_date::text from public.recurring_items where id = $1`,
      [billId],
    );
    expect(again.rows[0].next_due_date).toBe("2026-03-31");

    // The same occurrence cannot be settled twice.
    await expect(
      asUser(db, J(), (tx) =>
        tx.query(`select public.settle_recurring($1, $2, '2026-01-31', 'paid', p_paid_on => '2026-02-02')`, [
          f.householdA,
          billId,
        ]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
