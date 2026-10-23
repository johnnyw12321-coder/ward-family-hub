import { describe, expect, it } from "vitest";
import { earnedBadges, type BadgeStats } from "@/features/health/calc/achievements";
import { weekSummary } from "@/features/health/calc/insights";
import { currentStreak, longestStreak } from "@/features/health/calc/streaks";
import { bests, detectRecords, estimatedOneRepMax, overloadSuggestion } from "@/features/health/calc/strength";
import { goalLineAt, goalProgress, movingAverage, weeklyTrendChange } from "@/features/health/calc/trend";
import { EXERCISES, exercise } from "@/features/health/catalog/exercises";
import { FOODS, searchFoods } from "@/features/health/catalog/foods";
import { PROGRAMS, program, repTarget } from "@/features/health/catalog/programs";

describe("weight trend", () => {
  it("averages the weigh-ins within each 7-day window", () => {
    const t = movingAverage([
      { onDate: "2026-10-01", weightKg: 90 },
      { onDate: "2026-10-02", weightKg: 89 },
      { onDate: "2026-10-04", weightKg: 88 },
      { onDate: "2026-10-08", weightKg: 87 }, // window 10-02..10-08
    ]);
    expect(t.map((p) => p.avgKg)).toEqual([90, 89.5, 89, 88]);
  });

  it("measures the weekly change of the trend", () => {
    const days = Array.from({ length: 21 }, (_, i) => ({ onDate: `2026-10-${String(i + 1).padStart(2, "0")}`, weightKg: 90 - i * 0.1 }));
    expect(weeklyTrendChange(movingAverage(days))).toBeCloseTo(-0.7, 2);
    expect(weeklyTrendChange(movingAverage(days.slice(0, 3)))).toBeNull();
  });

  it("draws the goal line from start to target", () => {
    const goal = { startDate: "2026-10-01", startKg: 90, targetDate: "2026-10-31", targetKg: 87 };
    expect(goalLineAt(goal, "2026-10-01")).toBe(90);
    expect(goalLineAt(goal, "2026-10-16")).toBe(88.5);
    expect(goalLineAt(goal, "2026-12-01")).toBe(87);
  });

  it("works out progress towards the target in either direction", () => {
    expect(goalProgress(90, 87, 84)).toBe(0.5);
    expect(goalProgress(60, 63, 66)).toBe(0.5);
    expect(goalProgress(90, 92, 84)).toBe(0);
  });
});

describe("streaks", () => {
  it("counts back from today, or from yesterday if today isn't logged yet", () => {
    expect(currentStreak(["2026-10-21", "2026-10-22", "2026-10-23"], "2026-10-23")).toBe(3);
    expect(currentStreak(["2026-10-21", "2026-10-22"], "2026-10-23")).toBe(2);
    expect(currentStreak(["2026-10-20"], "2026-10-23")).toBe(0);
  });

  it("finds the longest run", () => {
    expect(longestStreak(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-06"])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});

describe("strength", () => {
  it("estimates a one-rep max (Epley)", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 10)).toBe(133.3);
    expect(estimatedOneRepMax(100, 20)).toBe(140); // capped at 12 reps
  });

  it("detects personal records, but not on the very first set", () => {
    const before = bests([{ reps: 8, weightKg: 60, durationS: null }]);
    expect(detectRecords({ reps: 5, weightKg: 62.5, durationS: null }, before, "weight", true)[0].kind).toBe("weight");
    expect(detectRecords({ reps: 10, weightKg: 60, durationS: null }, before, "weight", true)[0].kind).toBe("e1rm");
    expect(detectRecords({ reps: 6, weightKg: 60, durationS: null }, before, "weight", true)).toEqual([]);
    expect(detectRecords({ reps: 5, weightKg: 100, durationS: null }, bests([]), "weight", false)).toEqual([]);
    expect(detectRecords({ reps: 21, weightKg: null, durationS: null }, bests([{ reps: 20, weightKg: null, durationS: null }]), "reps", true)).toHaveLength(1);
  });

  it("suggests more weight once every set hits the top of the range", () => {
    const sets = [
      { reps: 12, weightKg: 60, durationS: null },
      { reps: 12, weightKg: 60, durationS: null },
    ];
    const s = overloadSuggestion(sets, { low: 8, high: 12 }, { kind: "weight", lower: false, dumbbell: false });
    expect(s).toMatchObject({ weightKg: 62.5, reps: 8 });
    const legs = overloadSuggestion(sets, { low: 8, high: 12 }, { kind: "weight", lower: true, dumbbell: false });
    expect(legs?.weightKg).toBe(65);
  });

  it("suggests more reps until then", () => {
    const sets = [
      { reps: 10, weightKg: 60, durationS: null },
      { reps: 9, weightKg: 60, durationS: null },
    ];
    expect(overloadSuggestion(sets, { low: 8, high: 12 }, { kind: "weight", lower: false, dumbbell: false })).toMatchObject({ weightKg: 60, reps: 10 });
    expect(overloadSuggestion([{ reps: 15, weightKg: null, durationS: null }], { low: 10, high: 15 }, { kind: "reps", lower: false, dumbbell: false })?.reps).toBe(16);
    expect(overloadSuggestion([{ reps: null, weightKg: null, durationS: 45 }], { low: 45, high: 45 }, { kind: "time", lower: false, dumbbell: false })?.durationS).toBe(50);
    expect(overloadSuggestion([], { low: 8, high: 12 }, { kind: "weight", lower: false, dumbbell: false })).toBeNull();
  });
});

describe("badges", () => {
  const none: BadgeStats = { weighIns: 0, foodLogDays: 0, longestStreak: 0, workouts: 0, records: 0, waterGoalDays: 0, measurements: 0, goalProgress: null };
  it("are earned when their condition is met", () => {
    expect(earnedBadges(none)).toEqual([]);
    expect(earnedBadges({ ...none, weighIns: 1, longestStreak: 7, goalProgress: 0.5 })).toEqual([
      "first_weigh_in",
      "streak_3",
      "streak_7",
      "goal_25",
      "goal_50",
    ]);
  });
});

describe("catalogues", () => {
  it("has 150+ foods with unique ids and sensible values", () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      // Calories should roughly match the macros (4/4/9), allowing for alcohol and fibre.
      const fromMacros = f.proteinG * 4 + f.carbsG * 4 + f.fatG * 9;
      if (["beer", "rum", "wine"].includes(f.id)) continue;
      expect(Math.abs(fromMacros - f.calories), f.id).toBeLessThanOrEqual(Math.max(25, f.calories * 0.2));
    }
  });

  it("searches by name, alias and partial words", () => {
    expect(searchFoods(FOODS, "chick breast")[0].id).toBe("chicken_breast");
    expect(searchFoods(FOODS, "chana").some((f) => f.id === "chickpeas")).toBe(true);
    expect(searchFoods(FOODS, "roti").length).toBeGreaterThanOrEqual(3);
    expect(searchFoods(FOODS, "zzzz")).toEqual([]);
  });

  it("has 100+ exercises with tips", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(EXERCISES.map((e) => e.key)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) expect(e.tips.length, e.key).toBeGreaterThanOrEqual(2);
  });

  it("builds a program for every goal, place, level and frequency", () => {
    expect(PROGRAMS).toHaveLength(72);
    for (const p of PROGRAMS) {
      expect(p.days, p.key).toHaveLength(p.daysPerWeek);
      for (const d of p.days) {
        expect(new Set(d.exercises.map((e) => e.key)).size, `${p.key} ${d.name}`).toBe(d.exercises.length);
        for (const e of d.exercises) expect(exercise(e.key), `${p.key}: ${e.key}`).toBeDefined();
      }
    }
  });

  it("keeps home programs to home equipment", () => {
    const home = PROGRAMS.filter((p) => p.place === "home");
    for (const p of home)
      for (const d of p.days)
        for (const e of d.exercises) expect(["bodyweight", "dumbbell", "kettlebell", "band"], `${p.key}: ${e.key}`).toContain(exercise(e.key)!.equipment);
  });

  it("scales difficulty with level", () => {
    const sets = (key: string) => program(key)!.days[0].exercises.reduce((s, e) => s + e.sets, 0);
    expect(sets("muscle_gym_beginner_4")).toBeLessThan(sets("muscle_gym_intermediate_4"));
    expect(sets("muscle_gym_intermediate_4")).toBeLessThan(sets("muscle_gym_advanced_4"));
  });

  it("reads rep targets", () => {
    expect(repTarget("8–12")).toEqual({ low: 8, high: 12, seconds: false });
    expect(repTarget("45 s")).toEqual({ low: 45, high: 45, seconds: true });
    expect(repTarget("15 min")).toEqual({ low: 900, high: 900, seconds: true });
  });
});

describe("weekly summary", () => {
  const base = {
    today: "2026-10-23",
    goal: "lose_fat" as const,
    foodLogs: [] as { onDate: string; calories: number; proteinG: number }[],
    water: [] as { onDate: string; totalMl: number }[],
    workoutDates: [] as string[],
    targets: { calories: 2000, proteinG: 150, waterMl: 2500, workoutsPerWeek: 3 },
    trendPerWeekKg: null as number | null,
    formatKg: (kg: number) => `${kg} kg`,
  };

  it("averages logged days and ignores an unfinished today", () => {
    const s = weekSummary({
      ...base,
      foodLogs: [
        { onDate: "2026-10-21", calories: 1900, proteinG: 140 },
        { onDate: "2026-10-22", calories: 2100, proteinG: 160 },
        { onDate: "2026-10-23", calories: 500, proteinG: 30 }, // breakfast only so far
        { onDate: "2026-10-10", calories: 4000, proteinG: 10 }, // outside the week
      ],
    });
    expect(s).toMatchObject({ daysLogged: 3, avgCalories: 2000, avgProtein: 150 });
    expect(s.insights[0]).toMatchObject({ tone: "good" });
  });

  it("nudges on low protein and patchy logging, praises the trend", () => {
    const s = weekSummary({
      ...base,
      foodLogs: [{ onDate: "2026-10-22", calories: 2000, proteinG: 90 }],
      workoutDates: ["2026-10-20", "2026-10-22", "2026-10-01"],
      trendPerWeekKg: -0.4,
    });
    expect(s.workouts).toBe(2);
    expect(s.insights.map((i) => i.text).join(" ")).toMatch(/short of your 150 g/);
    expect(s.insights.some((i) => /1 of the last 7 days/.test(i.text))).toBe(true);
    expect(s.insights.some((i) => /down 0.4 kg a week — heading the right way/.test(i.text))).toBe(true);
  });
});
