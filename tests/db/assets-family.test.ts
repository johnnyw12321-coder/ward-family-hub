import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, categoryId, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let car: string;
let house: string;
let chequing: string;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  await asUser(db, f.jonathan, async (tx) => {
    chequing = (
      await tx.query<{ id: string }>(`select public.create_account(p_household_id => $1, p_name => 'Chequing', p_type => 'chequing', p_opening_balance_minor => 5000000) as id`, [f.householdA])
    ).rows[0].id;
    car = (
      await tx.query<{ id: string }>(
        `insert into public.assets (household_id, type, name, make, model, next_service_date, insurance_renewal_date)
         values ($1, 'vehicle', 'Family car', 'Toyota', 'Corolla', '2026-10-20', '2027-03-01') returning id`,
        [f.householdA],
      )
    ).rows[0].id;
    house = (
      await tx.query<{ id: string }>(`insert into public.assets (household_id, type, name, property_kind) values ($1, 'property', 'Home', 'house') returning id`, [f.householdA])
    ).rows[0].id;
  });
});

describe("assets", () => {
  it("keeps the latest valuation as the current value", async () => {
    await asUser(db, f.jonathan, (tx) =>
      tx.query(
        `insert into public.asset_values (household_id, asset_id, valued_on, value_minor) values ($1, $2, '2025-06-30', 180000000), ($1, $2, '2026-06-30', 195000000)`,
        [f.householdA, house],
      ),
    );
    const r = await db.query<{ estimated_value_minor: number; value_as_of: string }>(
      `select estimated_value_minor, value_as_of::text from public.assets where id = $1`,
      [house],
    );
    expect(r.rows[0]).toEqual({ estimated_value_minor: 195000000, value_as_of: "2026-06-30" });

    const hist = await asUser(db, f.jonathan, (tx) =>
      tx.query<{ month: string; value_minor: number }>(`select month::text, value_minor from public.report_asset_values($1, '2025-05-01', '2025-07-01')`, [f.householdA]),
    );
    expect(hist.rows.map((x) => [x.month, Number(x.value_minor)])).toEqual([
      ["2025-05-01", 0],
      ["2025-06-01", 180000000],
      ["2025-07-01", 180000000],
    ]);
  });

  it("separates ledger spending from costs logged only on records", async () => {
    const vm = await categoryId(db, f.householdA, "Vehicle Maintenance");
    await asUser(db, f.jonathan, async (tx) => {
      const t = await tx.query<{ id: string }>(
        `select public.save_transaction(p_household_id => $1, p_kind => 'expense', p_amount_minor => 85000, p_account_id => $2,
           p_occurred_at => '2026-05-10T12:00:00Z', p_description => 'Oil change', p_category_id => $3, p_asset_id => $4) as id`,
        [f.householdA, chequing, vm, car],
      );
      await tx.query(
        `insert into public.asset_records (household_id, asset_id, kind, title, performed_on, cost_minor, transaction_id)
         values ($1, $2, 'service', 'Oil change', '2026-05-10', 85000, $3), ($1, $2, 'repair', 'Tyre patch', '2026-06-01', 15000, null)`,
        [f.householdA, car, t.rows[0].id],
      );
    });
    const r = await asUser(db, f.jonathan, (tx) =>
      tx.query<{ asset_id: string; ledger_minor: number; logged_minor: number }>(`select * from public.report_asset_costs($1, '2026-01-01', '2026-12-31')`, [f.householdA]),
    );
    const c = r.rows.find((x) => x.asset_id === car)!;
    expect([Number(c.ledger_minor), Number(c.logged_minor)]).toEqual([85000, 15000]);
  });

  it("refuses to link a transaction to another household's asset", async () => {
    const other = await asUser(db, f.outsider, async (tx) => {
      const acct = (await tx.query<{ id: string }>(`select public.create_account(p_household_id => $1, p_name => 'X', p_type => 'cash') as id`, [f.householdB])).rows[0].id;
      const cat = (await tx.query<{ id: string }>(`select id from public.transaction_categories where household_id = $1 and name = 'Fuel'`, [f.householdB])).rows[0].id;
      return { acct, cat };
    });
    await expect(
      asUser(db, f.outsider, (tx) =>
        tx.query(
          `select public.save_transaction(p_household_id => $1, p_kind => 'expense', p_amount_minor => 100, p_account_id => $2,
             p_occurred_at => now(), p_description => 'x', p_category_id => $3, p_asset_id => $4)`,
          [f.householdB, other.acct, other.cat, car],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("reminds about vehicle service dates", async () => {
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.refresh_notifications($1, '2026-10-14')`, [f.householdA]));
    const r = await asUser(db, f.adanna, (tx) => tx.query<{ title: string }>(`select title from public.notifications where kind like 'vehicle_%'`));
    expect(r.rows.map((x) => x.title)).toEqual(["Family car: service due 20/10/2026"]);
  });
});

describe("family", () => {
  let child: string;

  beforeAll(async () => {
    child = await asUser(db, f.adanna, async (tx) =>
      (
        await tx.query<{ id: string }>(
          `insert into public.family_members (household_id, full_name, preferred_name, relationship, date_of_birth) values ($1, 'Amara Ward', 'Amara', 'child', '2022-10-18') returning id`,
          [f.householdA],
        )
      ).rows[0].id,
    );
  });

  it("protects health details behind two-factor verification", async () => {
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`insert into public.family_health (household_id, family_member_id, allergies) values ($1, $2, 'Peanuts')`, [f.householdA, child])),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, { sub: f.adanna, aal: "aal2" }, (tx) =>
      tx.query(`insert into public.family_health (household_id, family_member_id, allergies) values ($1, $2, 'Peanuts')`, [f.householdA, child]),
    );
    const hidden = await asUser(db, f.jonathan, (tx) => tx.query(`select allergies from public.family_health where family_member_id = $1`, [child]));
    expect(hidden.rows).toHaveLength(0);
    const shown = await asUser(db, { sub: f.jonathan, aal: "aal2" }, (tx) =>
      tx.query<{ allergies: string }>(`select allergies from public.family_health where family_member_id = $1`, [child]),
    );
    expect(shown.rows[0].allergies).toBe("Peanuts");
  });

  it("never stores health values in the audit log", async () => {
    const r = await db.query<{ old_data: unknown; new_data: unknown }>(`select old_data, new_data from public.audit_logs where table_name = 'family_health'`);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) expect([row.old_data, row.new_data]).toEqual([null, null]);
  });

  it("keeps children's records away from other households", async () => {
    const r = await asUser(db, f.outsider, (tx) => tx.query(`select 1 from public.family_members where id = $1`, [child]));
    expect(r.rows).toHaveLength(0);
  });

  it("reminds about upcoming birthdays", async () => {
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.refresh_notifications($1, '2026-10-14')`, [f.householdA]));
    const r = await asUser(db, f.jonathan, (tx) => tx.query<{ title: string }>(`select title from public.notifications where kind = 'family_date'`));
    expect(r.rows.map((x) => x.title)).toEqual(["18/10: Amara's birthday"]);
  });
});
