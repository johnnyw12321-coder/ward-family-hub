import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let accountA: string;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  accountA = await asUser(db, f.jonathan, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `select public.create_account(p_household_id => $1, p_name => 'Republic Chequing',
         p_type => 'chequing', p_opening_balance_minor => 1000000) as id`,
      [f.householdA],
    );
    return r.rows[0].id;
  });
});

async function publicTables(): Promise<string[]> {
  const r = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return r.rows.map((x) => x.tablename);
}

describe("catalog guarantees", () => {
  it("enables row level security on every public table", async () => {
    const r = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it("creates every view with security_invoker so RLS applies to the caller", async () => {
    const r = await db.query<{ relname: string; reloptions: string[] | null }>(
      `select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'`,
    );
    for (const view of r.rows) {
      expect(view.reloptions ?? [], view.relname).toContain("security_invoker=true");
    }
  });

  it("does not expose SECURITY DEFINER functions in the public API schema", async () => {
    const r = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });
});

describe("anonymous access", () => {
  it("is denied on every public table", async () => {
    for (const table of await publicTables()) {
      await expect(
        asAnon(db, (tx) => tx.query(`select 1 from public.${table} limit 1`)),
        table,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("cannot call write functions", async () => {
    await expect(
      asAnon(db, (tx) =>
        tx.query(`select public.save_transaction($1, 'expense', 100, $2, now(), 'x')`, [
          f.householdA,
          accountA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("household isolation", () => {
  it("lets both adults see shared records", async () => {
    for (const user of [f.jonathan, f.adanna]) {
      const r = await asUser(db, user, (tx) =>
        tx.query(`select id from public.financial_accounts where id = $1`, [accountA]),
      );
      expect(r.rows).toHaveLength(1);
    }
  });

  it("hides another household's data from an outsider", async () => {
    // PGlite has a single connection: never call db.* inside an open transaction.
    const tables = await publicTables();
    const counts = await asUser(db, f.outsider, async (tx) => {
      const out: Record<string, number> = {};
      for (const table of tables) {
        const cols = await tx.query<{ column_name: string }>(
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = $1 and column_name in ('household_id', 'id')`,
          [table],
        );
        const names = cols.rows.map((c) => c.column_name);
        if (table === "households") {
          const r = await tx.query(`select 1 from public.households where id = $1`, [f.householdA]);
          out[table] = r.rows.length;
        } else if (names.includes("household_id")) {
          const r = await tx.query(`select 1 from public.${table} where household_id = $1`, [
            f.householdA,
          ]);
          out[table] = r.rows.length;
        }
      }
      return out;
    });
    for (const [table, n] of Object.entries(counts)) expect(n, table).toBe(0);
  });

  it("hides household A's views and reports from an outsider", async () => {
    await asUser(db, f.outsider, async (tx) => {
      const balances = await tx.query(`select * from public.account_balances where account_id = $1`, [accountA]);
      expect(balances.rows).toHaveLength(0);
      const summary = await tx.query<{ income_minor: number; expense_minor: number }>(
        `select * from public.report_summary($1, '2000-01-01', '2100-01-01')`,
        [f.householdA],
      );
      expect(summary.rows[0]).toMatchObject({ income_minor: 0, expense_minor: 0 });
    });
  });

  it("rejects an outsider inserting into another household", async () => {
    await expect(
      asUser(db, f.outsider, (tx) =>
        tx.query(`insert into public.financial_accounts (household_id, name, type) values ($1, 'Hack', 'cash')`, [
          f.householdA,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("silently affects zero rows when an outsider updates or deletes", async () => {
    await asUser(db, f.outsider, async (tx) => {
      const u = await tx.query(`update public.financial_accounts set name = 'pwned' where id = $1`, [accountA]);
      expect(u.affectedRows).toBe(0);
      const d = await tx.query(`delete from public.financial_accounts where id = $1`, [accountA]);
      expect(d.affectedRows).toBe(0);
    });
    const r = await db.query<{ name: string }>(`select name from public.financial_accounts where id = $1`, [accountA]);
    expect(r.rows[0].name).toBe("Republic Chequing");
  });

  it("cannot post to another household's account through the write API", async () => {
    await expect(
      asUser(db, f.outsider, (tx) =>
        tx.query(`select public.save_transaction($1, 'expense', 100, $2, now(), 'x')`, [f.householdA, accountA]),
      ),
    ).rejects.toThrow(/Account not found/);
  });

  it("blocks cross-household references with composite foreign keys", async () => {
    // The outsider writes into their own household but points at household A's account.
    await expect(
      asUser(db, f.outsider, async (tx) => {
        const t = await tx.query<{ id: string }>(
          `insert into public.transactions (household_id, kind, occurred_on, description)
           values ($1, 'adjustment', current_date, 'x') returning id`,
          [f.householdB],
        );
        await tx.query(
          `insert into public.transaction_entries (household_id, transaction_id, account_id, amount_minor)
           values ($1, $2, $3, 100)`,
          [f.householdB, t.rows[0].id, accountA],
        );
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it("prevents moving a row to another household", async () => {
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(`update public.financial_accounts set household_id = $1 where id = $2`, [f.householdB, accountA]),
      ),
    ).rejects.toThrow();
  });
});

describe("roles and membership", () => {
  it("lets a viewer read but not write", async () => {
    await asUser(db, f.viewer, async (tx) => {
      const r = await tx.query(`select 1 from public.financial_accounts where id = $1`, [accountA]);
      expect(r.rows).toHaveLength(1);
    });
    await expect(
      asUser(db, f.viewer, (tx) =>
        tx.query(`insert into public.financial_accounts (household_id, name, type) values ($1, 'x', 'cash')`, [
          f.householdA,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("does not let members change their own role or add members", async () => {
    await expect(
      asUser(db, f.adanna, (tx) =>
        tx.query(`update public.household_members set role = 'owner' where user_id = $1`, [f.adanna]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, f.adanna, (tx) =>
        tx.query(`insert into public.household_members (household_id, user_id, display_name) values ($1, $2, 'x')`, [
          f.householdA,
          f.outsider,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets a member edit only their own display name", async () => {
    await asUser(db, f.adanna, async (tx) => {
      const own = await tx.query(`update public.household_members set display_name = 'Adanna W.' where user_id = $1`, [
        f.adanna,
      ]);
      expect(own.affectedRows).toBe(1);
      const other = await tx.query(`update public.household_members set display_name = 'x' where user_id = $1`, [
        f.jonathan,
      ]);
      expect(other.affectedRows).toBe(0);
    });
  });

  it("does not let a user point their profile at a household they are not in", async () => {
    await expect(
      asUser(db, f.outsider, (tx) =>
        tx.query(`update public.profiles set default_household_id = $1 where id = $2`, [f.householdA, f.outsider]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("resolves the caller's household", async () => {
    const r = await asUser(db, f.adanna, (tx) => tx.query<{ id: string }>(`select public.current_household_id() as id`));
    expect(r.rows[0].id).toBe(f.householdA);
  });
});

describe("audit trail", () => {
  it("records who created and last modified a record", async () => {
    const id = await asUser(db, f.jonathan, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.financial_accounts (household_id, name, type) values ($1, 'Cash Tin', 'cash') returning id`,
        [f.householdA],
      );
      return r.rows[0].id;
    });
    await asUser(db, f.adanna, (tx) =>
      tx.query(`update public.financial_accounts set name = 'Cash Jar' where id = $1`, [id]),
    );
    const row = await db.query<{ created_by: string; updated_by: string }>(
      `select created_by, updated_by from public.financial_accounts where id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({ created_by: f.jonathan, updated_by: f.adanna });

    const log = await asUser(db, f.jonathan, (tx) =>
      tx.query<{ action: string; actor_id: string; changed_fields: string[] }>(
        `select action, actor_id, changed_fields from public.audit_logs where record_id = $1 order by id`,
        [id],
      ),
    );
    expect(log.rows.map((x) => x.action)).toEqual(["insert", "update"]);
    expect(log.rows[1]).toMatchObject({ actor_id: f.adanna, changed_fields: ["name"] });
  });

  it("does not let clients forge or erase audit entries", async () => {
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(`insert into public.audit_logs (household_id, table_name, action) values ($1, 'x', 'insert')`, [
          f.householdA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, f.jonathan, (tx) => tx.query(`delete from public.audit_logs where household_id = $1`, [f.householdA])),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let a client spoof created_by", async () => {
    const id = await asUser(db, f.adanna, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.financial_accounts (household_id, name, type, created_by) values ($1, 'Spoof', 'cash', $2) returning id`,
        [f.householdA, f.jonathan],
      );
      return r.rows[0].id;
    });
    const row = await db.query<{ created_by: string }>(`select created_by from public.financial_accounts where id = $1`, [id]);
    expect(row.rows[0].created_by).toBe(f.adanna);
  });
});
