import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, categoryId, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
const TOKEN = "a".repeat(20) + "-push-dispatch-test-token-" + "z".repeat(20);
const sub = (n: number) => ({ endpoint: `https://push.example.com/send/${n}`, p256dh: "B".repeat(87), auth: "c".repeat(22) });

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  await db.query(`select private.set_push_token_hash($1)`, [createHash("sha256").update(TOKEN).digest("hex")]);
  const util = await categoryId(db, f.householdA, "Electricity");
  await asUser(db, f.jonathan, (tx) =>
    tx.query(
      `insert into public.recurring_items (household_id, name, amount_minor, anchor_date, next_due_date, category_id, reminder_days_before)
       values ($1, 'Car loan', 310000, current_date, current_date, $2, 3)`,
      [f.householdA, util],
    ),
  );
});

const save = (user: string, household: string, n: number) =>
  asUser(db, user, (tx) =>
    tx.query(`select public.save_push_subscription($1, $2, $3, $4, 'test')`, [household, sub(n).endpoint, sub(n).p256dh, sub(n).auth]),
  );

describe("push subscriptions", () => {
  it("are private to the member who turned them on", async () => {
    await save(f.jonathan, f.householdA, 1);
    const mine = await asUser(db, f.jonathan, (tx) => tx.query(`select endpoint from public.push_subscriptions`));
    const hers = await asUser(db, f.adanna, (tx) => tx.query(`select endpoint from public.push_subscriptions`));
    expect(mine.rows).toHaveLength(1);
    expect(hers.rows).toHaveLength(0);
    await expect(asAnon(db, (tx) => tx.query(`select 1 from public.push_subscriptions`))).rejects.toThrow(/permission denied/);
  });

  it("can't be saved into another household", async () => {
    await expect(save(f.outsider, f.householdA, 9)).rejects.toThrow(/permission/);
  });

  it("move to whoever signs in on the phone next", async () => {
    await save(f.adanna, f.householdA, 2);
    await save(f.jonathan, f.householdA, 2); // same phone, now Jonathan's
    const owners = await db.query<{ user_id: string }>(`select user_id from public.push_subscriptions where endpoint = $1`, [sub(2).endpoint]);
    expect(owners.rows).toEqual([{ user_id: f.jonathan }]);
    await db.query(`delete from public.push_subscriptions where endpoint = $1`, [sub(2).endpoint]);
  });
});

describe("the daily push job", () => {
  it("is refused without the right token", async () => {
    await expect(asAnon(db, (tx) => tx.query(`select * from public.push_pending($1)`, ["wrong-" + TOKEN]))).rejects.toThrow(/Not allowed/);
    await expect(asAnon(db, (tx) => tx.query(`select public.push_record($1, '{}', '{}', $2, '{}')`, ["nope", [sub(1).endpoint]]))).rejects.toThrow(
      /Not allowed/,
    );
  });

  it("creates today's reminders and lists them only for members with a phone turned on", async () => {
    const r = await asAnon(db, (tx) => tx.query<{ user_id: string; title: string; endpoint: string; delivery_id: string }>(`select * from public.push_pending($1)`, [TOKEN]));
    expect(r.rows.length).toBeGreaterThan(0);
    expect(new Set(r.rows.map((x) => x.user_id))).toEqual(new Set([f.jonathan]));
    expect(r.rows.some((x) => /Car loan/.test(x.title))).toBe(true);
    expect(r.rows.every((x) => x.endpoint === sub(1).endpoint)).toBe(true);
    // Adanna got the reminder in her in-app list too, just no push (no phone on).
    const hers = await db.query(`select 1 from public.notifications where user_id = $1 and title like '%Car loan%'`, [f.adanna]);
    expect(hers.rows.length).toBeGreaterThan(0);

    // Recorded as sent: not sent again tomorrow.
    await asAnon(db, (tx) => tx.query(`select public.push_record($1, $2, '{}', '{}', $3)`, [TOKEN, r.rows.map((x) => x.delivery_id), [sub(1).endpoint]]));
    const again = await asAnon(db, (tx) => tx.query(`select * from public.push_pending($1)`, [TOKEN]));
    expect(again.rows).toHaveLength(0);
  });

  it("forgets phones the push service says are gone", async () => {
    await asAnon(db, (tx) => tx.query(`select public.push_record($1, '{}', '{}', $2, '{}')`, [TOKEN, [sub(1).endpoint]]));
    expect((await db.query(`select 1 from public.push_subscriptions where endpoint = $1`, [sub(1).endpoint])).rows).toHaveLength(0);
  });

  it("nudges only people who opted in and haven't logged anything today, once a day", async () => {
    await save(f.jonathan, f.householdA, 3);
    await save(f.adanna, f.householdA, 4);
    for (const user of [f.jonathan, f.adanna]) {
      await asUser(db, user, (tx) =>
        tx.query(`insert into public.notification_preferences (household_id, user_id, kind, push) values ($1, $2, 'daily_log', true)`, [f.householdA, user]),
      );
    }
    // Adanna already logged a coffee today; Jonathan didn't.
    const account = await asUser(db, f.adanna, async (tx) => {
      const a = await tx.query<{ id: string }>(`insert into public.financial_accounts (household_id, name, type) values ($1, 'Wallet', 'cash') returning id`, [
        f.householdA,
      ]);
      return a.rows[0].id;
    });
    const food = await categoryId(db, f.householdA, "Groceries");
    await asUser(db, f.adanna, (tx) => tx.query(`select public.save_transaction($1, 'expense', 2500, $2, now(), 'Coffee', p_category_id => $3)`, [f.householdA, account, food]));

    const first = await asAnon(db, (tx) => tx.query<{ user_id: string }>(`select * from public.push_nudges($1, 'daily_log')`, [TOKEN]));
    expect(first.rows.map((r) => r.user_id)).toEqual([f.jonathan]);
    const second = await asAnon(db, (tx) => tx.query(`select * from public.push_nudges($1, 'daily_log')`, [TOKEN]));
    expect(second.rows).toHaveLength(0);
    await expect(asAnon(db, (tx) => tx.query(`select * from public.push_nudges($1, 'daily_log')`, ["bad-" + TOKEN]))).rejects.toThrow(/Not allowed/);
    await expect(asAnon(db, (tx) => tx.query(`select * from public.push_nudges($1, 'anything')`, [TOKEN]))).rejects.toThrow(/Unknown reminder/);
  });

  it("sends the money check-in only on Sundays in the household's time zone", async () => {
    await asUser(db, f.jonathan, (tx) =>
      tx.query(`insert into public.notification_preferences (household_id, user_id, kind, push) values ($1, $2, 'weekly_checkin', true)`, [f.householdA, f.jonathan]),
    );
    const isSunday = (await db.query<{ sunday: boolean }>(`select extract(dow from now() at time zone 'America/Port_of_Spain') = 0 as sunday`)).rows[0].sunday;
    const r = await asAnon(db, (tx) => tx.query<{ user_id: string }>(`select * from public.push_nudges($1, 'weekly_checkin')`, [TOKEN]));
    expect(r.rows.length > 0).toBe(isSunday);
  });

  it("doesn't let the job's token reach anything else", async () => {
    await expect(asAnon(db, (tx) => tx.query(`select * from private.push_config`))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, (tx) => tx.query(`select private.set_push_token_hash('00')`))).rejects.toThrow(/permission denied/);
  });
});
