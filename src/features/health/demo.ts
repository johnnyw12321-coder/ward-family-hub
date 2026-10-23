import { addDays, type CalendarDate } from "@/lib/dates";
import { profilePlan } from "./calc/energy";
import { exercise } from "./catalog/exercises";
import { FOOD_BY_ID } from "./catalog/foods";
import { program, repTarget } from "./catalog/programs";
import type { HealthExport, HealthProfile, Meal } from "./types";

/**
 * Realistic sample data for previewing Ward Health: about two months of
 * weigh-ins, meals, water, measurements and workouts that follow a program
 * with steady progress. Built in the export format so it loads through the
 * same import path as a real backup. Deterministic for a given date.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DAYS = 60;

const DEFAULT_PROFILE = (today: CalendarDate): Omit<HealthProfile, "id"> => ({
  sex: "male",
  ageYears: 36,
  ageSetOn: addDays(today, -DAYS),
  heightCm: 178,
  activityLevel: "moderate",
  units: "metric",
  goal: "lose_fat",
  startWeightKg: 92,
  startDate: addDays(today, -DAYS),
  targetWeightKg: 84,
  targetDate: addDays(today, 100),
  dietPlan: "high_protein",
  fastingProtocol: null,
  fastStartedAt: null,
  waterGoalMl: 2750,
  activeProgram: "fat_loss_gym_intermediate_3",
  programStartedOn: addDays(today, -DAYS + 4),
  reminders: { weighIn: true, logMeals: true },
});

/** Meals as [catalog id, servings] lists; one is picked per meal per day. */
const MENUS: Record<Meal, [string, number][][]> = {
  breakfast: [
    [["oats", 1], ["banana", 1], ["milk_low_fat", 1]],
    [["egg", 2], ["wholewheat_bread", 2], ["avocado", 0.5]],
    [["buljol", 1], ["coconut_bake", 1]],
    [["greek_yoghurt", 1], ["granola", 0.5], ["blueberries", 0.5]],
    [["omelette", 1], ["wholewheat_bread", 1], ["orange_juice", 1]],
  ],
  lunch: [
    [["chicken_breast", 1.5], ["brown_rice", 1], ["broccoli", 1]],
    [["stew_chicken", 1], ["white_rice", 1], ["callaloo", 0.5]],
    [["chicken_roti", 1]],
    [["tuna_can", 1], ["salad_leaves", 1], ["olive_oil", 1], ["wholewheat_bread", 1]],
    [["curry_channa", 1], ["sada_roti", 1]],
    [["pelau", 1.5], ["coleslaw", 1]],
  ],
  dinner: [
    [["kingfish", 1.5], ["dasheen", 1], ["bodi", 1]],
    [["salmon", 1.5], ["sweet_potato", 1], ["green_beans", 1]],
    [["lean_mince", 1.5], ["pasta", 1], ["tomato", 1]],
    [["curry_chicken", 1], ["white_rice", 1], ["pak_choi", 1]],
    [["red_snapper", 1.5], ["breadfruit", 1], ["spinach", 1]],
  ],
  snack: [
    [["apple", 1], ["peanut_butter", 0.5]],
    [["whey", 1], ["banana", 1]],
    [["almonds", 1]],
    [["cottage_cheese", 1], ["pineapple", 1]],
    [["protein_bar", 1]],
  ],
};

/** Starting working weights (kg) by exercise for the demo's lifter. */
const START_KG: Record<string, number> = {
  back_squat: 70, front_squat: 50, leg_press: 120, hack_squat: 80, romanian_deadlift: 60, deadlift: 90, sumo_deadlift: 80,
  barbell_bench_press: 60, incline_dumbbell_press: 20, dumbbell_bench_press: 22, machine_chest_press: 50,
  overhead_press: 37.5, dumbbell_shoulder_press: 16, machine_shoulder_press: 40, barbell_row: 55, seated_cable_row: 50,
  dumbbell_row: 24, t_bar_row: 40, lat_pulldown: 50, walking_lunge: 14, bulgarian_split_squat: 12, step_up: 12,
  lateral_raise: 8, hip_thrust: 70, cable_pull_through: 25, hip_abduction: 40, barbell_curl: 25, cable_curl: 20,
  hammer_curl: 12, incline_curl: 10, tricep_pushdown: 25, skull_crusher: 25, overhead_tricep_extension: 16,
  leg_curl: 35, leg_extension: 40, standing_calf_raise: 60, seated_calf_raise: 40, cable_crunch: 30, pallof_press: 15,
  kettlebell_swing: 20, goblet_squat: 20, dumbbell_romanian_deadlift: 20, dumbbell_floor_press: 18, arnold_press: 12,
  face_pull: 20, rear_delt_fly: 6, cable_fly: 12, pec_deck: 40, dumbbell_fly: 10, single_leg_rdl: 12, renegade_row: 10,
  dumbbell_pullover: 16, dumbbell_curl: 10, concentration_curl: 10, cable_lateral_raise: 5,
};

export function buildDemoExport(today: CalendarDate, existing?: HealthProfile | null): HealthExport {
  const rand = rng(Number(today.replaceAll("-", "")));
  const base = existing ? { ...existing, startDate: addDays(today, -DAYS), activeProgram: existing.activeProgram ?? DEFAULT_PROFILE(today).activeProgram } : DEFAULT_PROFILE(today);
  const programKey = base.activeProgram ?? "general_gym_beginner_3";
  const prog = program(programKey) ?? program("general_gym_beginner_3")!;
  const start = addDays(today, -DAYS);
  const losing = base.goal === "lose_fat";
  const totalChange = losing ? -4.6 : base.goal === "maintain" ? 0 : base.goal === "gain_weight" ? 3.2 : 1.6;
  const startKg = base.startWeightKg;
  // The menus average about 1,750 kcal a day; scale portions to roughly match this person's target.
  const target = profilePlan({ ...base, id: "demo" }, startKg, today).target;
  const portion = Math.min(1.6, Math.max(0.8, (target * 0.95) / 1750));

  const weighIns: Record<string, unknown>[] = [];
  const foodLogs: Record<string, unknown>[] = [];
  const water: Record<string, unknown>[] = [];
  const measurements: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const sets: Record<string, unknown>[] = [];

  for (let i = 0; i <= DAYS; i++) {
    const day = addDays(start, i);
    const progress = i / DAYS;
    const kg = Math.round((startKg + totalChange * progress + (rand() - 0.5) * 0.9) * 10) / 10;
    // Most mornings, with the odd gap.
    if (i === 0 || i === DAYS || rand() < 0.82) {
      weighIns.push({ on_date: day, weight_kg: kg, note: null });
    }
    if (i % 14 === 0) {
      const waist = 98 + (losing ? -6 : 1) * progress;
      measurements.push({
        on_date: day,
        waist_cm: Math.round(waist * 10) / 10,
        chest_cm: Math.round((104 + (losing ? -2 : 2) * progress) * 10) / 10,
        hips_cm: Math.round((103 + (losing ? -3.5 : 1) * progress) * 10) / 10,
        arm_cm: Math.round((35 + 0.6 * progress) * 10) / 10,
        thigh_cm: Math.round((60 + (losing ? -1.5 : 1) * progress) * 10) / 10,
      });
    }
    // Food and water for the last 35 days (plus today so far).
    if (i >= DAYS - 35) {
      const meals: Meal[] = i === DAYS ? ["breakfast", "lunch"] : ["breakfast", "lunch", "dinner", "snack"];
      for (const meal of meals) {
        if (meal === "snack" && rand() < 0.3) continue;
        const menu = MENUS[meal][Math.floor(rand() * MENUS[meal].length)];
        for (const [id, usual] of menu) {
          const f = FOOD_BY_ID.get(id)!;
          const servings = Math.max(0.25, Math.round(usual * portion * 4) / 4);
          foodLogs.push({
            on_date: day,
            meal,
            name: f.name,
            source: "catalog",
            food_ref: id,
            servings,
            calories: Math.round(f.calories * servings),
            protein_g: Math.round(f.proteinG * servings * 10) / 10,
            carbs_g: Math.round(f.carbsG * servings * 10) / 10,
            fat_g: Math.round(f.fatG * servings * 10) / 10,
          });
        }
      }
      water.push({ on_date: day, total_ml: i === DAYS ? 1250 : Math.round((1750 + rand() * 1500) / 250) * 250 });
    }
  }

  // Workouts: the program's days in order, on Mon/Wed/Fri-style spacing.
  const programStart = addDays(start, 4);
  let dayIndex = 0;
  let sessionNo = 0;
  const perWeek = prog.daysPerWeek;
  const gaps = perWeek === 3 ? [2, 2, 3] : perWeek === 4 ? [1, 2, 1, 3] : [1, 1, 1, 1, 3];
  for (let d = programStart; d < today; d = addDays(d, gaps[sessionNo % gaps.length])) {
    sessionNo++;
    if (rand() < 0.08) continue; // a missed session now and then
    const template = prog.days[dayIndex % prog.days.length];
    const weeksIn = Math.floor((sessionNo - 1) / perWeek);
    const id = `demo-${sessionNo}`;
    const startedAt = `${d}T${String(17 + Math.floor(rand() * 2)).padStart(2, "0")}:${String(Math.floor(rand() * 50)).padStart(2, "0")}:00-04:00`;
    const finishedAt = new Date(new Date(startedAt).getTime() + (50 + Math.floor(rand() * 20)) * 60_000).toISOString();
    sessions.push({ id, on_date: d, name: template.name, program_key: prog.key, program_day: dayIndex % prog.days.length, custom_workout_id: null, started_at: startedAt, finished_at: finishedAt, notes: null });
    template.exercises.forEach((pe, position) => {
      const ex = exercise(pe.key)!;
      const target = repTarget(pe.reps);
      for (let n = 1; n <= pe.sets; n++) {
        if (ex.kind === "time") {
          sets.push({ session_id: id, exercise_key: pe.key, position, set_number: n, reps: null, weight_kg: null, duration_s: Math.min(target.high + weeksIn * 5, target.high * 2), note: null });
        } else if (ex.kind === "reps") {
          sets.push({ session_id: id, exercise_key: pe.key, position, set_number: n, reps: Math.max(1, target.low + weeksIn - (n > 2 ? 1 : 0)), weight_kg: null, duration_s: null, note: null });
        } else {
          const startKgEx = START_KG[pe.key] ?? 20;
          const step = ex.lower ? 5 : ex.equipment === "dumbbell" ? 1 : 2.5;
          // Double progression: reps climb for two weeks, then weight goes up.
          const kgEx = startKgEx + Math.floor(weeksIn / 2) * step;
          const reps = Math.min(target.high, target.low + (weeksIn % 2) * 2 + (n === pe.sets && rand() < 0.4 ? -1 : 0));
          sets.push({ session_id: id, exercise_key: pe.key, position, set_number: n, reps: Math.max(1, reps), weight_kg: kgEx, duration_s: null, note: null });
        }
      }
    });
    dayIndex++;
  }

  const profile = {
    sex: base.sex,
    age_years: base.ageYears,
    age_set_on: base.ageSetOn,
    height_cm: base.heightCm,
    activity_level: base.activityLevel,
    units: base.units,
    goal: base.goal,
    start_weight_kg: startKg,
    start_date: start,
    target_weight_kg: base.targetWeightKg,
    target_date: base.targetDate && base.targetDate > today ? base.targetDate : base.targetWeightKg ? addDays(today, 100) : null,
    diet_plan: base.dietPlan ?? "high_protein",
    fasting_protocol: base.fastingProtocol,
    water_goal_ml: base.waterGoalMl,
    active_program: prog.key,
    program_started_on: programStart,
    reminders: base.reminders,
  };

  return {
    format: "ward-health-export",
    version: 1,
    exported_at: new Date().toISOString(),
    profile,
    weigh_ins: weighIns,
    foods: [{ id: "demo-food-1", name: "Mum's chicken pelau", serving: "1 cup", calories: 430, protein_g: 22, carbs_g: 54, fat_g: 14, archived_at: null }],
    saved_meals: [
      {
        name: "Usual breakfast",
        items: [
          { name: "Rolled oats, dry", source: "catalog", foodRef: "oats", servings: 1, calories: 150, proteinG: 5, carbsG: 27, fatG: 2.5 },
          { name: "Banana", source: "catalog", foodRef: "banana", servings: 1, calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4 },
          { name: "Low-fat milk (2%)", source: "catalog", foodRef: "milk_low_fat", servings: 1, calories: 122, proteinG: 8, carbsG: 12, fatG: 4.8 },
        ],
      },
    ],
    food_logs: foodLogs,
    water,
    measurements,
    custom_workouts: [
      {
        id: "demo-custom-1",
        name: "Quick core",
        notes: "15 minutes when there's no time for the full session.",
        exercises: [
          { key: "plank", sets: 3, reps: "45 s", restS: 30 },
          { key: "dead_bug", sets: 3, reps: "12", restS: 30 },
          { key: "bicycle_crunch", sets: 3, reps: "20", restS: 30 },
          { key: "side_plank", sets: 2, reps: "30 s", restS: 30 },
        ],
      },
    ],
    workout_sessions: sessions,
    workout_sets: sets,
    achievements: [],
  };
}
