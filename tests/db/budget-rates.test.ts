import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, categoryId, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
});

const amount = async (rate: number, period: string, month: string) =>
  Number((await db.query<{ a: string }>(`select public.budget_rate_amount($1, $2, $3) as a`, [rate, period, month])).rows[0].a);

describe("budget rates", () => {
  it("turn a rate into the month's amount", async () => {
    // November 2026: 30 days, 21 weekdays. December 2026: 31 days, 23 weekdays.
    expect(await amount(3000, "weekday", "2026-11-01")).toBe(63000);
    expect(await amount(3000, "weekday", "2026-12-01")).toBe(69000);
    expect(await amount(5000, "day", "2026-11-01")).toBe(150000);
    expect(await amount(20000, "week", "2026-11-01")).toBe(85714); // 20000 × 30 ÷ 7
    expect(await amount(20000, "week", "2026-12-01")).toBe(88571); // 20000 × 31 ÷ 7
    expect(await amount(20000, "week", "2027-02-01")).toBe(80000); // exactly 4 weeks
  });

  it("must be set as a pair", async () => {
    const fuel = await categoryId(db, f.householdA, "Fuel");
    await expect(
      asUser(db, f.jonathan, async (tx) => {
        const b = await tx.query<{ id: string }>(`insert into public.budgets (household_id, month) values ($1, '2026-09-01') returning id`, [f.householdA]);
        await tx.query(
          `insert into public.budget_allocations (household_id, budget_id, category_id, amount_minor, rate_minor) values ($1, $2, $3, 100, 100)`,
          [f.householdA, b.rows[0].id, fuel],
        );
      }),
    ).rejects.toThrow(/rate_pair/);
  });

  it("are recalculated when a budget is copied to another month", async () => {
    const fuel = await categoryId(db, f.householdA, "Fuel");
    const groceries = await categoryId(db, f.householdA, "Groceries");
    await asUser(db, f.jonathan, async (tx) => {
      const b = await tx.query<{ id: string }>(`insert into public.budgets (household_id, month) values ($1, '2026-11-01') returning id`, [f.householdA]);
      await tx.query(
        `insert into public.budget_allocations (household_id, budget_id, category_id, amount_minor, rate_minor, rate_period)
         values ($1, $2, $3, 85714, 20000, 'week'), ($1, $2, $4, 120000, null, null)`,
        [f.householdA, b.rows[0].id, fuel, groceries],
      );
      await tx.query(`select public.copy_budget($1, '2026-11-01', '2026-12-01')`, [f.householdA]);
    });
    const rows = await db.query<{ category_id: string; amount_minor: number; rate_minor: number | null; rate_period: string | null }>(
      `select a.category_id, a.amount_minor, a.rate_minor, a.rate_period
       from public.budget_allocations a join public.budgets b on b.id = a.budget_id
       where b.household_id = $1 and b.month = '2026-12-01'`,
      [f.householdA],
    );
    const byCat = new Map(rows.rows.map((r) => [r.category_id, r]));
    expect(byCat.get(fuel)).toMatchObject({ amount_minor: 88571, rate_minor: 20000, rate_period: "week" });
    expect(byCat.get(groceries)).toMatchObject({ amount_minor: 120000, rate_minor: null, rate_period: null });
  });
});

describe("budget lines for the rest of a month", () => {
  it("count only spending from the start day, and copy as a whole month", async () => {
    const travel = await categoryId(db, f.householdA, "Taxi & Rideshare");
    const budgetId = await asUser(db, f.jonathan, async (tx) => {
      const acct = await tx.query<{ id: string }>(
        `select public.create_account(p_household_id => $1, p_name => 'Chequing', p_type => 'chequing'::public.account_type,
           p_opening_balance_minor => 100000, p_opening_date => '2026-01-01T12:00:00Z') as id`,
        [f.householdA],
      );
      for (const [day, amt] of [["2026-10-10", 4000], ["2026-10-25", 3000], ["2026-10-27", 2500]] as const) {
        await tx.query(
          `select public.save_transaction(p_household_id => $1, p_kind => 'expense', p_amount_minor => $2, p_account_id => $3,
             p_occurred_at => $4, p_description => 'taxi', p_category_id => $5)`,
          [f.householdA, amt, acct.rows[0].id, `${day}T12:00:00Z`, travel],
        );
      }
      const b = await tx.query<{ id: string }>(`insert into public.budgets (household_id, month) values ($1, '2026-10-01') returning id`, [f.householdA]);
      // TT$30 a day from 25 Oct: 7 days.
      await tx.query(
        `insert into public.budget_allocations (household_id, budget_id, category_id, amount_minor, rate_minor, rate_period, starts_on)
         values ($1, $2, $3, 21000, 3000, 'day', '2026-10-25')`,
        [f.householdA, b.rows[0].id, travel],
      );
      return b.rows[0].id;
    });

    const progress = await asUser(db, f.jonathan, (tx) =>
      tx.query<{ category_id: string | null; spent_minor: number }>(`select category_id, spent_minor from public.budget_progress($1, '2026-10-01')`, [f.householdA]),
    );
    const spent = new Map(progress.rows.map((r) => [r.category_id, Number(r.spent_minor)]));
    expect(spent.get(travel)).toBe(5500); // 25 and 27 Oct
    expect(spent.get(null)).toBe(4000); // 10 Oct, before the line started

    await asUser(db, f.jonathan, (tx) => tx.query(`select public.copy_budget($1, '2026-10-01', '2026-11-01')`, [f.householdA]));
    const nov = await db.query<{ amount_minor: number; starts_on: string | null }>(
      `select a.amount_minor, a.starts_on from public.budget_allocations a join public.budgets b on b.id = a.budget_id
       where b.household_id = $1 and b.month = '2026-11-01' and a.category_id = $2`,
      [f.householdA, travel],
    );
    expect(nov.rows[0]).toMatchObject({ amount_minor: 90000, starts_on: null }); // 30 days × TT$30

    // The start day has to be in the budget's month, and only a rate can have one.
    await expect(
      asUser(db, f.jonathan, (tx) => tx.query(`update public.budget_allocations set starts_on = '2026-11-02' where budget_id = $1`, [budgetId])),
    ).rejects.toThrow(/budget's month/);
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(`update public.budget_allocations set rate_minor = null, rate_period = null where budget_id = $1`, [budgetId]),
      ),
    ).rejects.toThrow(/starts_on_rate/);
  });
});
