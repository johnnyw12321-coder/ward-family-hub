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
