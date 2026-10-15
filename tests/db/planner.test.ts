import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let planId: string;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  planId = await asUser(db, f.adanna, async (tx) => {
    const p = await tx.query<{ id: string }>(`insert into public.spending_plans (household_id, name) values ($1, '2027 budget') returning id`, [
      f.householdA,
    ]);
    await tx.query(
      `insert into public.spending_plan_lines (household_id, plan_id, kind, label, amount_minor, frequency)
       values ($1, $2, 'income', 'Salary', 800000, 'monthly'), ($1, $2, 'expense', 'Groceries', 60000, 'weekly')`,
      [f.householdA, p.rows[0].id],
    );
    return p.rows[0].id;
  });
});

describe("planner", () => {
  it("is shared by the household and invisible to anyone else", async () => {
    const mine = await asUser(db, f.jonathan, (tx) => tx.query(`select label from public.spending_plan_lines where plan_id = $1`, [planId]));
    expect(mine.rows).toHaveLength(2);
    const theirs = await asUser(db, f.outsider, async (tx) => ({
      plans: (await tx.query(`select 1 from public.spending_plans`)).rows.length,
      lines: (await tx.query(`select 1 from public.spending_plan_lines`)).rows.length,
    }));
    expect(theirs).toEqual({ plans: 0, lines: 0 });
  });

  it("refuses lines that point at another household's plan", async () => {
    await expect(
      asUser(db, f.outsider, (tx) =>
        tx.query(
          `insert into public.spending_plan_lines (household_id, plan_id, kind, label) values ($1, $2, 'expense', 'Sneaky')`,
          [f.householdB, planId],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("is read-only for viewers", async () => {
    await expect(
      asUser(db, f.viewer, (tx) => tx.query(`insert into public.spending_plans (household_id, name) values ($1, 'Mine')`, [f.householdA])),
    ).rejects.toThrow(/row-level security/);
    const updated = await asUser(db, f.viewer, (tx) =>
      tx.query(`update public.spending_plan_lines set amount_minor = 1 where plan_id = $1 returning id`, [planId]),
    );
    expect(updated.rows).toHaveLength(0);
  });

  it("marks the plan as changed, by whom, when a line is edited", async () => {
    await db.query(`update public.spending_plans set updated_at = '2020-01-01' where id = $1`, [planId]);
    await asUser(db, f.jonathan, (tx) => tx.query(`update public.spending_plan_lines set amount_minor = 65000 where label = 'Groceries'`));
    const r = await db.query<{ recent: boolean; updated_by: string }>(
      `select updated_at > now() - interval '1 minute' as recent, updated_by from public.spending_plans where id = $1`,
      [planId],
    );
    expect(r.rows[0]).toEqual({ recent: true, updated_by: f.jonathan });
  });

  it("rejects negative amounts and unknown frequencies", async () => {
    for (const values of ["-1, 'monthly'", "100, 'daily'"]) {
      await expect(
        asUser(db, f.jonathan, (tx) =>
          tx.query(
            `insert into public.spending_plan_lines (household_id, plan_id, kind, amount_minor, frequency) values ($1, $2, 'expense', ${values})`,
            [f.householdA, planId],
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it("removes a plan's lines with the plan", async () => {
    await asUser(db, f.adanna, (tx) => tx.query(`delete from public.spending_plans where id = $1`, [planId]));
    const r = await db.query(`select 1 from public.spending_plan_lines where plan_id = $1`, [planId]);
    expect(r.rows).toHaveLength(0);
  });
});
