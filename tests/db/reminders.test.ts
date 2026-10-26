import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, categoryId, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let taskId: string;
let billId: string;

const TODAY = "2026-10-15";

const refresh = (user = f.jonathan) =>
  asUser(db, user, (tx) => tx.query(`select public.refresh_notifications($1, $2)`, [f.householdA, TODAY]));

const titles = async (user: string, prefix: string) =>
  (
    await db.query<{ title: string }>(`select title from public.notifications where user_id = $1 and dedupe_key like $2 order by title`, [
      user,
      `${prefix}%`,
    ])
  ).rows.map((r) => r.title);

const setReminder = (source: string, item: string, lead: number | null, muted: boolean, snoozed: string | null, user = f.jonathan) =>
  asUser(db, user, (tx) =>
    tx.query(`select public.set_reminder($1, $2, $3, $4, $5, $6)`, [f.householdA, source, item, lead, muted, snoozed]),
  );

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  const util = await categoryId(db, f.householdA, "Electricity");
  [taskId, billId] = await asUser(db, f.jonathan, async (tx) => {
    const t = await tx.query<{ id: string }>(
      `insert into public.tasks (household_id, title, due_date) values ($1, 'Renew passport', '2026-10-18') returning id`,
      [f.householdA],
    );
    const b = await tx.query<{ id: string }>(
      `insert into public.recurring_items (household_id, name, amount_minor, anchor_date, next_due_date, category_id, reminder_days_before)
       values ($1, 'T&TEC', 45000, '2026-10-20', '2026-10-20', $2, 3) returning id`,
      [f.householdA, util],
    );
    return [t.rows[0].id, b.rows[0].id];
  });
});

describe("editable reminders", () => {
  it("a task reminds on its due date by default, or earlier when asked", async () => {
    await refresh();
    expect(await titles(f.jonathan, `task:${taskId}`)).toEqual([]);
    await setReminder("task", taskId, 3, false, null);
    await refresh();
    expect(await titles(f.jonathan, `task:${taskId}`)).toEqual(["Due 18/10: Renew passport"]);
    // Shared: Adanna gets it too.
    expect(await titles(f.adanna, `task:${taskId}`)).toEqual(["Due 18/10: Renew passport"]);
  });

  it("changing a bill's timing updates the bill itself", async () => {
    await refresh();
    expect(await titles(f.jonathan, `bill:${billId}`)).toEqual([]); // 5 days away, reminds 3 days before
    await setReminder("bill", billId, 7, false, null);
    const r = await db.query<{ d: number }>(`select reminder_days_before as d from public.recurring_items where id = $1`, [billId]);
    expect(r.rows[0].d).toBe(7);
    await refresh();
    expect(await titles(f.jonathan, `bill:${billId}`)).toEqual(["T&TEC is due 20/10/2026"]);
  });

  it("turning a reminder off clears it for everyone and keeps it away", async () => {
    await setReminder("bill", billId, null, true, null);
    expect(await titles(f.adanna, `bill:${billId}`)).toEqual([]);
    await refresh();
    expect(await titles(f.jonathan, `bill:${billId}`)).toEqual([]);
  });

  it("a snoozed reminder comes back after the snooze date", async () => {
    await setReminder("bill", billId, null, false, "2026-10-16");
    await refresh();
    expect(await titles(f.jonathan, `bill:${billId}`)).toEqual([]);
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.refresh_notifications($1, '2026-10-16')`, [f.householdA]));
    expect(await titles(f.jonathan, `bill:${billId}`)).toEqual(["T&TEC is due 20/10/2026"]);
  });

  it("is refused for read-only members, other households and unknown items", async () => {
    await expect(setReminder("task", taskId, 1, false, null, f.viewer)).rejects.toThrow(/permission/);
    await expect(setReminder("task", taskId, 1, false, null, f.outsider)).rejects.toThrow(/permission/);
    await expect(setReminder("task", "00000000-0000-0000-0000-000000000000", 1, false, null)).rejects.toThrow(/no longer exists/);
    await expect(setReminder("event", taskId, 3, false, null)).rejects.toThrow(/Events can remind/);
    await expect(setReminder("nonsense", taskId, 1, false, null)).rejects.toThrow(/Unknown/);
  });

  it("settings are visible to the household but not to anyone else", async () => {
    const mine = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from public.reminder_settings`));
    const theirs = await asUser(db, f.outsider, (tx) => tx.query(`select 1 from public.reminder_settings`));
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(theirs.rows).toHaveLength(0);
  });
});
