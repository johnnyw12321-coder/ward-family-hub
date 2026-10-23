import type { CalendarDate } from "@/lib/dates";

/**
 * Ward Health domain types. Storage is always metric (kg, cm, ml); the units
 * preference only affects display and input (see calc/units.ts).
 */

export const SEXES = ["male", "female", "unspecified"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const GOALS = ["lose_fat", "build_muscle", "gain_weight", "maintain"] as const;
export type Goal = (typeof GOALS)[number];

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type Units = (typeof UNIT_SYSTEMS)[number];

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export const FASTING_PROTOCOLS = ["16:8", "18:6"] as const;
export type FastingProtocol = (typeof FASTING_PROTOCOLS)[number];

export type Reminders = {
  weighIn?: boolean;
  logMeals?: boolean;
  workouts?: boolean;
  water?: boolean;
};

export type HealthProfile = {
  id: string;
  sex: Sex;
  ageYears: number;
  ageSetOn: CalendarDate;
  heightCm: number;
  activityLevel: ActivityLevel;
  units: Units;
  goal: Goal;
  startWeightKg: number;
  startDate: CalendarDate;
  targetWeightKg: number | null;
  targetDate: CalendarDate | null;
  dietPlan: string | null;
  fastingProtocol: FastingProtocol | null;
  fastStartedAt: string | null;
  waterGoalMl: number;
  activeProgram: string | null;
  programStartedOn: CalendarDate | null;
  reminders: Reminders;
};

export type ProfileFields = Omit<HealthProfile, "id">;

export type WeighIn = { id: string; onDate: CalendarDate; weightKg: number; note: string | null };

export type Nutrition = { calories: number; proteinG: number; carbsG: number; fatG: number };

export type FoodSource = "catalog" | "custom" | "quick";

export type FoodLog = Nutrition & {
  id: string;
  onDate: CalendarDate;
  meal: Meal;
  name: string;
  source: FoodSource;
  foodRef: string | null;
  servings: number;
};

export type NewFoodLog = Omit<FoodLog, "id">;

export type CustomFood = Nutrition & { id: string; name: string; serving: string; archivedAt: string | null };

export type MealItem = Nutrition & { name: string; source: FoodSource; foodRef: string | null; servings: number };

export type SavedMeal = { id: string; name: string; items: MealItem[] };

export type WaterDay = { onDate: CalendarDate; totalMl: number };

export const MEASUREMENT_KEYS = ["waistCm", "chestCm", "hipsCm", "armCm", "thighCm"] as const;
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];
export type Measurement = { id: string; onDate: CalendarDate } & Record<MeasurementKey, number | null>;

export type CustomWorkoutExercise = { key: string; sets: number; reps: string; restS: number };
export type CustomWorkout = { id: string; name: string; notes: string | null; exercises: CustomWorkoutExercise[] };

export type WorkoutSession = {
  id: string;
  onDate: CalendarDate;
  name: string;
  programKey: string | null;
  programDay: number | null;
  customWorkoutId: string | null;
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
};

export type WorkoutSet = {
  id: string;
  sessionId: string;
  exerciseKey: string;
  position: number;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  note: string | null;
};

export type Achievement = { badgeKey: string; earnedOn: CalendarDate; seenAt: string | null };

/** Export file: snake_case, the same shape public.health_import() reads. */
export type HealthExport = {
  format: "ward-health-export";
  version: 1;
  exported_at: string;
  profile: Record<string, unknown> | null;
  weigh_ins: Record<string, unknown>[];
  foods: Record<string, unknown>[];
  saved_meals: Record<string, unknown>[];
  food_logs: Record<string, unknown>[];
  water: Record<string, unknown>[];
  measurements: Record<string, unknown>[];
  custom_workouts: Record<string, unknown>[];
  workout_sessions: Record<string, unknown>[];
  workout_sets: Record<string, unknown>[];
  achievements: Record<string, unknown>[];
};
