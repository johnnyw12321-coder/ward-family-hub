import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDemoExport } from "@/features/health/demo";
import { asAnon, asUser, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;

const PROFILE = `insert into public.health_profiles
  (household_id, user_id, sex, age_years, height_cm, activity_level, goal, start_weight_kg, target_weight_kg, target_date)
  values ($1, $2, 'male', 38, 180, 'moderate', 'lose_fat', 95, 85, current_date + 120)`;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  await asUser(db, f.jonathan, async (tx) => {
    await tx.query(PROFILE, [f.householdA, f.jonathan]);
    await tx.query(`insert into public.health_weigh_ins (household_id, user_id, on_date, weight_kg) values ($1, $2, current_date, 94.6)`, [
      f.householdA,
      f.jonathan,
    ]);
  });
});

describe("Ward Health privacy", () => {
  it("keeps each person's data to themselves, even within the household", async () => {
    const mine = await asUser(db, f.jonathan, (tx) => tx.query(`select weight_kg from public.health_weigh_ins`));
    const hers = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from public.health_weigh_ins`));
    const profiles = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from public.health_profiles`));
    expect(mine.rows).toHaveLength(1);
    expect(hers.rows).toHaveLength(0);
    expect(profiles.rows).toHaveLength(0);
    await expect(asAnon(db, (tx) => tx.query(`select 1 from public.health_profiles`))).rejects.toThrow(/permission denied/);
  });

  it("refuses rows written for someone else or another household", async () => {
    await expect(
      asUser(db, f.adanna, (tx) =>
        tx.query(`insert into public.health_weigh_ins (household_id, user_id, on_date, weight_kg) values ($1, $2, current_date, 70)`, [
          f.householdA,
          f.jonathan,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, f.outsider, (tx) =>
        tx.query(`insert into public.health_weigh_ins (household_id, user_id, on_date, weight_kg) values ($1, $2, current_date, 70)`, [
          f.householdA,
          f.outsider,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("lets read-only household members keep their own health data", async () => {
    await asUser(db, f.viewer, (tx) => tx.query(PROFILE, [f.householdA, f.viewer]));
    const r = await asUser(db, f.viewer, (tx) => tx.query(`select 1 from public.health_profiles`));
    expect(r.rows).toHaveLength(1);
  });

  it("never writes Ward Health changes to the household-visible audit log", async () => {
    const r = await db.query(`select 1 from public.audit_logs where table_name like 'health_%'`);
    expect(r.rows).toHaveLength(0);
  });

  it("can't move a record to another person", async () => {
    const r = await asUser(db, f.jonathan, (tx) =>
      tx.query(`update public.health_weigh_ins set user_id = $1 returning id`, [f.adanna]),
    ).catch((e: Error) => e);
    expect(r).toBeInstanceOf(Error);
  });
});

describe("Ward Health import and reset", () => {
  const exportData = {
    profile: { sex: "female", age_years: 34, height_cm: 165, activity_level: "light", goal: "maintain", start_weight_kg: 64 },
    weigh_ins: [{ on_date: "2026-10-01", weight_kg: 64.2 }, { on_date: "2026-10-02", weight_kg: 64.0 }],
    foods: [{ id: "f1", name: "Mum's pelau", serving: "1 cup", calories: 410, protein_g: 18, carbs_g: 55, fat_g: 13 }],
    food_logs: [{ on_date: "2026-10-02", meal: "lunch", name: "Mum's pelau", source: "custom", food_ref: "f1", servings: 1, calories: 410 }],
    custom_workouts: [{ id: "w1", name: "Legs", exercises: [{ key: "goblet_squat", sets: 3, reps: "10" }] }],
    workout_sessions: [{ id: "s1", on_date: "2026-10-02", name: "Legs", custom_workout_id: "w1", finished_at: "2026-10-02T12:00:00Z", started_at: "2026-10-02T11:00:00Z" }],
    workout_sets: [{ session_id: "s1", exercise_key: "goblet_squat", position: 0, set_number: 1, reps: 10, weight_kg: 16 }],
    achievements: [{ badge_key: "first_weigh_in", earned_on: "2026-10-01" }],
  };

  it("replaces only the caller's data and keeps links between records", async () => {
    await asUser(db, f.adanna, (tx) => tx.query(`select public.health_import($1, $2)`, [f.householdA, JSON.stringify(exportData)]));
    const r = await asUser(db, f.adanna, async (tx) => ({
      weighIns: (await tx.query(`select 1 from public.health_weigh_ins`)).rows.length,
      linked: (
        await tx.query<{ ok: boolean }>(
          `select l.food_ref = fo.id::text as ok from public.health_food_logs l join public.health_foods fo on fo.name = l.name`,
        )
      ).rows,
      sets: (
        await tx.query(
          `select 1 from public.health_workout_sets st join public.health_workout_sessions se on se.id = st.session_id
           join public.health_custom_workouts w on w.id = se.custom_workout_id`,
        )
      ).rows.length,
    }));
    expect(r).toEqual({ weighIns: 2, linked: [{ ok: true }], sets: 1 });
    // Jonathan's data is untouched.
    const his = await asUser(db, f.jonathan, (tx) => tx.query(`select 1 from public.health_weigh_ins`));
    expect(his.rows).toHaveLength(1);
  });

  it("can be imported twice (fresh ids every time)", async () => {
    await asUser(db, f.adanna, (tx) => tx.query(`select public.health_import($1, $2)`, [f.householdA, JSON.stringify(exportData)]));
    const r = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from public.health_workout_sessions`));
    expect(r.rows).toHaveLength(1);
  });

  it("rolls back entirely when the file has broken links", async () => {
    const broken = { ...exportData, workout_sets: [{ ...exportData.workout_sets[0], session_id: "missing" }] };
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`select public.health_import($1, $2)`, [f.householdA, JSON.stringify(broken)])),
    ).rejects.toThrow(/don't belong/);
    const r = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from public.health_weigh_ins`));
    expect(r.rows).toHaveLength(2);
  });

  it("reset clears the caller's Ward Health data and nothing else", async () => {
    await asUser(db, f.adanna, (tx) => tx.query(`select public.health_reset($1)`, [f.householdA]));
    const hers = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from public.health_profiles`));
    const his = await asUser(db, f.jonathan, (tx) => tx.query(`select 1 from public.health_profiles`));
    const household = await db.query(`select 1 from public.household_members where user_id = $1`, [f.adanna]);
    expect(hers.rows).toHaveLength(0);
    expect(his.rows).toHaveLength(1);
    expect(household.rows).toHaveLength(1);
  });

  it("loads the generated demo data through the same import", async () => {
    const demo = buildDemoExport("2026-10-23");
    await asUser(db, f.adanna, (tx) => tx.query(`select public.health_import($1, $2)`, [f.householdA, JSON.stringify(demo)]));
    const counts = await asUser(db, f.adanna, async (tx) => ({
      weighIns: (await tx.query(`select 1 from public.health_weigh_ins`)).rows.length,
      sessions: (await tx.query(`select 1 from public.health_workout_sessions where finished_at is not null`)).rows.length,
      sets: (await tx.query(`select 1 from public.health_workout_sets`)).rows.length,
      logs: (await tx.query(`select 1 from public.health_food_logs`)).rows.length,
    }));
    expect(counts.weighIns).toBeGreaterThan(40);
    expect(counts.sessions).toBeGreaterThan(15);
    expect(counts.sets).toBeGreaterThan(200);
    expect(counts.logs).toBeGreaterThan(100);
  });

  it("can't reset another household's data", async () => {
    await expect(asUser(db, f.outsider, (tx) => tx.query(`select public.health_reset($1)`, [f.householdA]))).rejects.toThrow(/permission/);
  });
});
