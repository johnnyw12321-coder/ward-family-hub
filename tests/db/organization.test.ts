import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, categoryId, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
});

describe("tasks", () => {
  it("completes a recurring task: logs history, advances the due date and resets the checklist", async () => {
    const taskId = await asUser(db, f.jonathan, async (tx) => {
      const t = await tx.query<{ id: string }>(
        `insert into public.tasks (household_id, title, due_date, recurrence_frequency, recurrence_interval, recurrence_anchor)
         values ($1, 'Take out recycling', '2026-10-14', 'weekly', 1, '2026-10-14') returning id`,
        [f.householdA],
      );
      await tx.query(`insert into public.task_checklist_items (household_id, task_id, title, is_done) values ($1, $2, 'Rinse bottles', true)`, [
        f.householdA,
        t.rows[0].id,
      ]);
      return t.rows[0].id;
    });
    const next = await asUser(db, f.adanna, (tx) =>
      tx.query<{ d: string }>(`select public.complete_task($1, $2, '2026-10-15')::text as d`, [f.householdA, taskId]),
    );
    expect(next.rows[0].d).toBe("2026-10-21");
    const state = await db.query<{ status: string; done: boolean; n: number }>(
      `select t.status, (select bool_or(is_done) from public.task_checklist_items where task_id = t.id) as done,
              (select count(*)::int from public.task_completions where task_id = t.id) as n
       from public.tasks t where t.id = $1`,
      [taskId],
    );
    expect(state.rows[0]).toEqual({ status: "todo", done: false, n: 1 });
  });

  it("closes a one-off task and refuses to complete it twice", async () => {
    const id = await asUser(db, f.jonathan, async (tx) =>
      (await tx.query<{ id: string }>(`insert into public.tasks (household_id, title) values ($1, 'Renew passport') returning id`, [f.householdA]))
        .rows[0].id,
    );
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.complete_task($1, $2, '2026-10-14')`, [f.householdA, id]));
    const r = await db.query<{ status: string; completed_by: string }>(`select status, completed_by from public.tasks where id = $1`, [id]);
    expect(r.rows[0]).toEqual({ status: "done", completed_by: f.jonathan });
    await expect(
      asUser(db, f.jonathan, (tx) => tx.query(`select public.complete_task($1, $2, '2026-10-14')`, [f.householdA, id])),
    ).rejects.toThrow(/already closed/);
  });

  it("lets only the author edit or delete a comment", async () => {
    const commentId = await asUser(db, f.jonathan, async (tx) => {
      const t = await tx.query<{ id: string }>(`insert into public.tasks (household_id, title) values ($1, 'Fix gate') returning id`, [f.householdA]);
      const c = await tx.query<{ id: string }>(
        `insert into public.task_comments (household_id, task_id, body) values ($1, $2, 'Bought hinges') returning id`,
        [f.householdA, t.rows[0].id],
      );
      return c.rows[0].id;
    });
    const byOther = await asUser(db, f.adanna, (tx) => tx.query(`update public.task_comments set body = 'edited' where id = $1`, [commentId]));
    expect(byOther.affectedRows).toBe(0);
    const del = await asUser(db, f.adanna, (tx) => tx.query(`delete from public.task_comments where id = $1`, [commentId]));
    expect(del.affectedRows).toBe(0);
    const byAuthor = await asUser(db, f.jonathan, (tx) => tx.query(`update public.task_comments set body = 'Bought 2 hinges' where id = $1`, [commentId]));
    expect(byAuthor.affectedRows).toBe(1);
  });
});

describe("shopping", () => {
  it("records who checked an item and copies a list without checked state", async () => {
    const listId = await asUser(db, f.adanna, async (tx) => {
      const l = await tx.query<{ id: string }>(`insert into public.shopping_lists (household_id, name, is_template) values ($1, 'Weekly', true) returning id`, [f.householdA]);
      await tx.query(
        `insert into public.shopping_items (household_id, list_id, name, estimated_price_minor, is_checked) values ($1, $2, 'Milk', 1850, true), ($1, $2, 'Bread', 1500, false)`,
        [f.householdA, l.rows[0].id],
      );
      return l.rows[0].id;
    });
    const checked = await db.query<{ checked_by: string }>(`select checked_by from public.shopping_items where name = 'Milk'`);
    expect(checked.rows[0].checked_by).toBe(f.adanna);

    const copy = await asUser(db, f.jonathan, (tx) =>
      tx.query<{ id: string }>(`select public.copy_shopping_list($1, $2, 'This week') as id`, [f.householdA, listId]),
    );
    const items = await db.query<{ name: string; is_checked: boolean }>(
      `select name, is_checked from public.shopping_items where list_id = $1 order by name`,
      [copy.rows[0].id],
    );
    expect(items.rows).toEqual([
      { name: "Bread", is_checked: false },
      { name: "Milk", is_checked: false },
    ]);
  });
});

describe("notifications", () => {
  beforeAll(async () => {
    const util = await categoryId(db, f.householdA, "Electricity");
    await asUser(db, f.jonathan, async (tx) => {
      await tx.query(
        `insert into public.recurring_items (household_id, name, amount_minor, anchor_date, next_due_date, category_id, reminder_days_before)
         values ($1, 'T&TEC', 45000, '2026-10-10', '2026-10-10', $2, 3), ($1, 'WASA', 30000, '2026-10-16', '2026-10-16', $2, 3),
                ($1, 'Netflix', 9000, '2026-11-30', '2026-11-30', $2, 3)`,
        [f.householdA, util],
      );
      await tx.query(
        `insert into public.tasks (household_id, title, due_date, assigned_user_id) values ($1, 'Book dentist', '2026-10-12', $2)`,
        [f.householdA, f.adanna],
      );
      await tx.query(
        `insert into public.calendar_events (household_id, title, category, all_day, starts_at, ends_at, recurrence_frequency, reminder_minutes)
         values ($1, 'Adanna''s birthday', 'birthday', true, '1990-10-15T04:00:00Z', '1990-10-15T04:00:00Z', 'yearly', '{1440}'),
                ($1, 'Quiet event', 'family', true, '2026-10-15T04:00:00Z', '2026-10-15T04:00:00Z', null, '{}'),
                ($1, 'School concert', 'school', false, '2026-10-20T22:00:00Z', '2026-10-20T23:00:00Z', null, '{10080}')`,
        [f.householdA],
      );
    });
  });

  it("generates bill, task and event reminders once (idempotent)", async () => {
    const first = await asUser(db, f.jonathan, (tx) =>
      tx.query<{ n: number }>(`select public.refresh_notifications($1, '2026-10-14') as n`, [f.householdA]),
    );
    const second = await asUser(db, f.adanna, (tx) =>
      tx.query<{ n: number }>(`select public.refresh_notifications($1, '2026-10-14') as n`, [f.householdA]),
    );
    expect(Number(first.rows[0].n)).toBeGreaterThan(0);
    expect(Number(second.rows[0].n)).toBe(0);

    const mine = await asUser(db, f.adanna, (tx) =>
      tx.query<{ kind: string; title: string }>(`select kind, title from public.notifications order by kind, title`),
    );
    const kinds = mine.rows.map((r) => r.kind);
    expect(kinds).toContain("bill_overdue"); // T&TEC
    expect(kinds).toContain("bill_due"); // WASA within 3 days
    expect(kinds).toContain("task_overdue"); // assigned to Adanna
    expect(mine.rows.find((r) => r.kind === "event_upcoming" && r.title.includes("birthday"))?.title).toBe("Tomorrow: Adanna's birthday");
    expect(mine.rows.some((r) => r.title.includes("Netflix"))).toBe(false);
    expect(mine.rows.some((r) => r.title.includes("Quiet event"))).toBe(false); // no reminders set
    expect(mine.rows.find((r) => r.title.includes("School concert"))?.title).toBe("20/10: School concert"); // 1 week ahead

    const his = await asUser(db, f.jonathan, (tx) => tx.query<{ kind: string }>(`select kind from public.notifications`));
    expect(his.rows.map((r) => r.kind)).not.toContain("task_overdue"); // not his task
  });

  it("keeps each member's notifications private, even from their partner", async () => {
    const adannaIds = await asUser(db, f.adanna, (tx) => tx.query<{ id: string }>(`select id from public.notifications`));
    const id = adannaIds.rows[0].id;
    await asUser(db, f.jonathan, async (tx) => {
      expect((await tx.query(`select 1 from public.notifications where id = $1`, [id])).rows).toHaveLength(0);
      expect((await tx.query(`update public.notifications set read_at = now() where id = $1`, [id])).affectedRows).toBe(0);
    });
    const ok = await asUser(db, f.adanna, (tx) => tx.query(`update public.notifications set read_at = now() where id = $1`, [id]));
    expect(ok.affectedRows).toBe(1);
  });

  it("only allows changing read/dismissed state", async () => {
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`update public.notifications set title = 'x' where user_id = $1`, [f.adanna])),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects notifications addressed to someone outside the household", async () => {
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(
          `insert into public.notifications (household_id, user_id, kind, title, dedupe_key) values ($1, $2, 'x', 'Hi', 'k')`,
          [f.householdA, f.outsider],
        ),
      ),
    ).rejects.toThrow();
  });

  it("does nothing for read-only members or other households", async () => {
    const viewer = await asUser(db, f.viewer, (tx) =>
      tx.query<{ n: number }>(`select public.refresh_notifications($1, '2026-10-14') as n`, [f.householdA]),
    );
    expect(Number(viewer.rows[0].n)).toBe(0);
    const outsider = await asUser(db, f.outsider, (tx) =>
      tx.query<{ n: number }>(`select public.refresh_notifications($1, '2026-10-14') as n`, [f.householdA]),
    );
    expect(Number(outsider.rows[0].n)).toBe(0);
  });
});

describe("goals", () => {
  it("validates that balance-driven goals link an account", async () => {
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(`insert into public.goals (household_id, name, progress_source, target_minor) values ($1, 'Emergency fund', 'account_balance', 6000000)`, [
          f.householdA,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("stores contributions against a goal", async () => {
    await asUser(db, f.jonathan, async (tx) => {
      const g = await tx.query<{ id: string }>(
        `insert into public.goals (household_id, name, progress_source, target_minor) values ($1, 'Tobago trip', 'contributions', 1500000) returning id`,
        [f.householdA],
      );
      await tx.query(
        `insert into public.goal_contributions (household_id, goal_id, contributed_on, amount_minor) values ($1, $2, '2026-10-01', 250000), ($1, $2, '2026-10-14', 100000)`,
        [f.householdA, g.rows[0].id],
      );
      const s = await tx.query<{ total: number }>(`select sum(amount_minor)::bigint total from public.goal_contributions where goal_id = $1`, [g.rows[0].id]);
      expect(Number(s.rows[0].total)).toBe(350_000);
    });
  });
});
