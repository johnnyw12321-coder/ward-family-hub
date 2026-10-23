import { exercise } from "./exercises";

/**
 * Built-in workout programs: every combination of goal × place × level ×
 * days a week (72 programs). Each one is built from a proven split (full body,
 * upper/lower, push/pull/legs) by filling movement patterns with exercises
 * that suit the place, then applying the goal's sets, reps and rest.
 */
export const PROGRAM_GOALS = {
  fat_loss: "Fat loss",
  muscle: "Muscle building",
  mass: "Weight & mass gain",
  general: "General fitness",
} as const;
export type ProgramGoal = keyof typeof PROGRAM_GOALS;

export const PLACES = { home: "Home", gym: "Gym" } as const;
export type Place = keyof typeof PLACES;

export const LEVELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;
export type Level = keyof typeof LEVELS;

export const DAYS_OPTIONS = [3, 4, 5] as const;
export type DaysPerWeek = (typeof DAYS_OPTIONS)[number];

export type ProgramExercise = { key: string; sets: number; reps: string; restS: number };
export type ProgramDay = { name: string; focus: string; exercises: ProgramExercise[] };
export type Program = {
  key: string;
  name: string;
  goal: ProgramGoal;
  place: Place;
  level: Level;
  daysPerWeek: DaysPerWeek;
  split: string;
  schedule: string;
  description: string;
  days: ProgramDay[];
};

type Pattern =
  | "squat" | "hinge" | "h_push" | "v_push" | "h_pull" | "v_pull" | "lunge" | "ham_iso" | "glute" | "quad_iso"
  | "calves" | "chest_iso" | "shoulder_iso" | "rear_delt" | "biceps" | "triceps" | "core";

const POOLS: Record<Pattern, Record<Place, string[]>> = {
  squat: { gym: ["back_squat", "front_squat", "leg_press", "hack_squat"], home: ["goblet_squat", "bulgarian_split_squat", "bodyweight_squat"] },
  hinge: { gym: ["romanian_deadlift", "deadlift", "sumo_deadlift"], home: ["dumbbell_romanian_deadlift", "single_leg_rdl", "kettlebell_swing"] },
  h_push: { gym: ["barbell_bench_press", "incline_dumbbell_press", "dumbbell_bench_press", "machine_chest_press"], home: ["push_up", "dumbbell_floor_press", "decline_push_up"] },
  v_push: { gym: ["overhead_press", "dumbbell_shoulder_press", "machine_shoulder_press"], home: ["dumbbell_shoulder_press", "pike_push_up", "arnold_press"] },
  h_pull: { gym: ["barbell_row", "seated_cable_row", "dumbbell_row", "t_bar_row"], home: ["dumbbell_row", "renegade_row", "inverted_row"] },
  v_pull: { gym: ["lat_pulldown", "pull_up", "chin_up"], home: ["dumbbell_pullover", "band_pull_apart"] },
  lunge: { gym: ["walking_lunge", "bulgarian_split_squat", "step_up"], home: ["reverse_lunge", "bulgarian_split_squat", "step_up"] },
  ham_iso: { gym: ["leg_curl", "nordic_curl"], home: ["single_leg_glute_bridge", "nordic_curl"] },
  glute: { gym: ["hip_thrust", "cable_pull_through", "hip_abduction"], home: ["glute_bridge", "banded_lateral_walk", "single_leg_glute_bridge"] },
  quad_iso: { gym: ["leg_extension"], home: ["wall_sit", "split_squat"] },
  calves: { gym: ["standing_calf_raise", "seated_calf_raise"], home: ["single_leg_calf_raise"] },
  chest_iso: { gym: ["cable_fly", "pec_deck", "dumbbell_fly"], home: ["dumbbell_fly", "incline_push_up"] },
  shoulder_iso: { gym: ["lateral_raise", "cable_lateral_raise"], home: ["lateral_raise"] },
  rear_delt: { gym: ["face_pull", "rear_delt_fly"], home: ["rear_delt_fly", "band_pull_apart"] },
  biceps: { gym: ["barbell_curl", "cable_curl", "hammer_curl", "incline_curl"], home: ["dumbbell_curl", "hammer_curl", "concentration_curl"] },
  triceps: { gym: ["tricep_pushdown", "skull_crusher", "overhead_tricep_extension"], home: ["overhead_tricep_extension", "diamond_push_up", "bench_dip"] },
  core: { gym: ["plank", "cable_crunch", "hanging_leg_raise", "pallof_press"], home: ["plank", "dead_bug", "bicycle_crunch", "lying_leg_raise"] },
};

/** Easier first choices for beginners training at home. */
const BEGINNER_HOME: Partial<Record<Pattern, string[]>> = {
  h_push: ["incline_push_up", "dumbbell_floor_press", "push_up"],
  squat: ["goblet_squat", "bodyweight_squat", "split_squat"],
};

const FINISHERS: Record<"intervals" | "steady", Record<Place, string[]>> = {
  intervals: { gym: ["rowing_machine", "battle_ropes", "stair_climber", "kettlebell_swing"], home: ["burpee", "mountain_climber", "jump_rope", "high_knees"] },
  steady: { gym: ["cycling", "treadmill_incline_walk", "elliptical"], home: ["brisk_walk", "run", "jump_rope"] },
};

type Slot = [pattern: Pattern, variant: number, role: "compound" | "accessory"];
type DayTemplate = { name: string; focus: string; slots: Slot[] };

const SPLITS: Record<DaysPerWeek, { split: string; schedule: string; days: DayTemplate[] }> = {
  3: {
    split: "Full body",
    schedule: "Mon · Wed · Fri",
    days: [
      { name: "Full body A", focus: "Squat, push, pull", slots: [["squat", 0, "compound"], ["h_push", 0, "compound"], ["h_pull", 0, "compound"], ["hinge", 0, "accessory"], ["shoulder_iso", 0, "accessory"], ["core", 0, "accessory"]] },
      { name: "Full body B", focus: "Hinge, press, pull-down", slots: [["hinge", 1, "compound"], ["v_push", 0, "compound"], ["v_pull", 0, "compound"], ["lunge", 0, "accessory"], ["biceps", 0, "accessory"], ["core", 1, "accessory"]] },
      { name: "Full body C", focus: "Legs, chest, back", slots: [["squat", 1, "compound"], ["h_push", 1, "compound"], ["h_pull", 1, "compound"], ["glute", 0, "accessory"], ["triceps", 0, "accessory"], ["core", 2, "accessory"]] },
    ],
  },
  4: {
    split: "Upper / lower",
    schedule: "Mon · Tue · Thu · Fri",
    days: [
      { name: "Upper A", focus: "Chest and back", slots: [["h_push", 0, "compound"], ["h_pull", 0, "compound"], ["v_push", 0, "compound"], ["v_pull", 0, "accessory"], ["biceps", 0, "accessory"], ["triceps", 0, "accessory"]] },
      { name: "Lower A", focus: "Squat focus", slots: [["squat", 0, "compound"], ["hinge", 0, "compound"], ["lunge", 0, "accessory"], ["ham_iso", 0, "accessory"], ["calves", 0, "accessory"], ["core", 0, "accessory"]] },
      { name: "Upper B", focus: "Shoulders and back", slots: [["v_push", 1, "compound"], ["v_pull", 1, "compound"], ["h_push", 1, "compound"], ["h_pull", 1, "accessory"], ["shoulder_iso", 0, "accessory"], ["rear_delt", 0, "accessory"]] },
      { name: "Lower B", focus: "Hinge focus", slots: [["hinge", 1, "compound"], ["squat", 1, "compound"], ["glute", 0, "accessory"], ["quad_iso", 0, "accessory"], ["calves", 1, "accessory"], ["core", 1, "accessory"]] },
    ],
  },
  5: {
    split: "Push / pull / legs + upper / lower",
    schedule: "Mon – Fri",
    days: [
      { name: "Push", focus: "Chest, shoulders, triceps", slots: [["h_push", 0, "compound"], ["v_push", 0, "compound"], ["h_push", 1, "compound"], ["shoulder_iso", 0, "accessory"], ["triceps", 0, "accessory"], ["triceps", 1, "accessory"]] },
      { name: "Pull", focus: "Back and biceps", slots: [["v_pull", 0, "compound"], ["h_pull", 0, "compound"], ["h_pull", 1, "accessory"], ["rear_delt", 0, "accessory"], ["biceps", 0, "accessory"], ["biceps", 1, "accessory"]] },
      { name: "Legs", focus: "Quads, hamstrings, glutes", slots: [["squat", 0, "compound"], ["hinge", 0, "compound"], ["lunge", 0, "accessory"], ["ham_iso", 0, "accessory"], ["calves", 0, "accessory"], ["core", 0, "accessory"]] },
      { name: "Upper", focus: "Balanced upper body", slots: [["h_push", 2, "compound"], ["h_pull", 2, "compound"], ["v_push", 1, "compound"], ["v_pull", 1, "accessory"], ["chest_iso", 0, "accessory"], ["biceps", 2, "accessory"]] },
      { name: "Lower", focus: "Posterior chain", slots: [["hinge", 1, "compound"], ["squat", 1, "compound"], ["glute", 0, "accessory"], ["quad_iso", 0, "accessory"], ["calves", 1, "accessory"], ["core", 1, "accessory"]] },
    ],
  },
};

type Scheme = { sets: number; reps: string; restS: number };
const SCHEMES: Record<ProgramGoal, { compound: Scheme; accessory: Scheme; finisher?: { kind: "intervals" | "steady"; sets: number; reps: string; restS: number } }> = {
  fat_loss: {
    compound: { sets: 3, reps: "10–12", restS: 75 },
    accessory: { sets: 3, reps: "12–15", restS: 60 },
    finisher: { kind: "intervals", sets: 4, reps: "30 s", restS: 30 },
  },
  muscle: { compound: { sets: 4, reps: "6–10", restS: 120 }, accessory: { sets: 3, reps: "10–15", restS: 75 } },
  mass: { compound: { sets: 4, reps: "5–8", restS: 150 }, accessory: { sets: 3, reps: "8–12", restS: 90 } },
  general: {
    compound: { sets: 3, reps: "8–12", restS: 90 },
    accessory: { sets: 2, reps: "12–15", restS: 60 },
    finisher: { kind: "steady", sets: 1, reps: "15 min", restS: 0 },
  },
};

const HOLD_TIMES: Record<Level, string> = { beginner: "30 s", intermediate: "45 s", advanced: "60 s" };

const DESCRIPTIONS: Record<ProgramGoal, string> = {
  fat_loss: "Strength work to keep your muscle while you're in a deficit, with short, sharp interval finishers to burn extra calories.",
  muscle: "Moderate-to-heavy compound lifts and plenty of accessory volume — the classic recipe for building muscle.",
  mass: "Heavier, lower-rep compound lifts with longer rest, backed by accessories. Pair it with a calorie surplus to gain size.",
  general: "Balanced strength for everyday life plus steady cardio for your heart. A great place to start or to stay fit.",
};

function pick(pattern: Pattern, variant: number, place: Place, level: Level): string {
  const pool = (place === "home" && level === "beginner" && BEGINNER_HOME[pattern]) || POOLS[pattern][place];
  return pool[variant % pool.length];
}

function buildDay(t: DayTemplate, goal: ProgramGoal, place: Place, level: Level, dayIndex: number): ProgramDay {
  const scheme = SCHEMES[goal];
  // Beginners do one fewer accessory and one fewer set; advanced lifters do an extra set on compounds.
  const slots = level === "beginner" ? t.slots.slice(0, -1) : t.slots;
  const used = new Set<string>();
  const exercises: ProgramExercise[] = slots.map(([pattern, variant, role]) => {
    let key = pick(pattern, variant, place, level);
    for (let i = 1; used.has(key) && i < 4; i++) key = pick(pattern, variant + i, place, level);
    used.add(key);
    const s = scheme[role];
    const sets = Math.max(2, s.sets + (level === "beginner" ? -1 : level === "advanced" && role === "compound" ? 1 : 0));
    const timed = exercise(key)?.kind === "time";
    return { key, sets, reps: timed ? HOLD_TIMES[level] : s.reps, restS: s.restS };
  });
  if (scheme.finisher) {
    const f = scheme.finisher;
    const pool = FINISHERS[f.kind][place];
    exercises.push({
      key: pool[dayIndex % pool.length],
      sets: f.kind === "intervals" ? f.sets + (level === "advanced" ? 2 : level === "beginner" ? -1 : 0) : f.sets,
      reps: f.kind === "steady" ? (level === "beginner" ? "10 min" : level === "advanced" ? "20 min" : f.reps) : f.reps,
      restS: f.restS,
    });
  }
  return { name: t.name, focus: t.focus, exercises };
}

export const PROGRAMS: Program[] = (Object.keys(PROGRAM_GOALS) as ProgramGoal[]).flatMap((goal) =>
  (Object.keys(PLACES) as Place[]).flatMap((place) =>
    (Object.keys(LEVELS) as Level[]).flatMap((level) =>
      DAYS_OPTIONS.map((days): Program => {
        const split = SPLITS[days];
        return {
          key: `${goal}_${place}_${level}_${days}`,
          name: `${PROGRAM_GOALS[goal]} ${place === "home" ? "at home" : "in the gym"}`,
          goal,
          place,
          level,
          daysPerWeek: days,
          split: split.split,
          schedule: split.schedule,
          description: `${DESCRIPTIONS[goal]} ${place === "home" ? "Needs only your bodyweight, a pair of dumbbells and a resistance band." : "Uses barbells, cables and machines."}`,
          days: split.days.map((t, i) => buildDay(t, goal, place, level, i)),
        };
      }),
    ),
  ),
);

export const PROGRAM_BY_KEY = new Map(PROGRAMS.map((p) => [p.key, p]));

export function program(key: string | null | undefined): Program | undefined {
  return key ? PROGRAM_BY_KEY.get(key) : undefined;
}

/** Ward Health goal → the program goal that suits it. */
export const PROGRAM_GOAL_FOR = { lose_fat: "fat_loss", build_muscle: "muscle", gain_weight: "mass", maintain: "general" } as const;

/** Lower bound of a rep range ("8–12" → 8, "30 s" → 30), used to prefill the logger. */
export function repTarget(reps: string): { low: number; high: number; seconds: boolean } {
  const seconds = /s$|min$/.test(reps.trim());
  const nums = reps.match(/\d+/g)?.map(Number) ?? [10];
  const scale = /min$/.test(reps.trim()) ? 60 : 1;
  return { low: nums[0] * scale, high: (nums[1] ?? nums[0]) * scale, seconds };
}
