import type { CalendarDate } from "@/lib/dates";
import type {
  Achievement,
  CustomFood,
  CustomWorkout,
  FoodLog,
  HealthExport,
  HealthProfile,
  Measurement,
  MealItem,
  NewFoodLog,
  ProfileFields,
  SavedMeal,
  WaterDay,
  WeighIn,
  WorkoutSession,
  WorkoutSet,
} from "./types";

export type DateRange = { from?: CalendarDate; to?: CalendarDate };

/**
 * Every read and write Ward Health makes. Pages and actions only ever talk to
 * this interface, so the storage behind it (Supabase today) can be swapped
 * without touching the UI. Implementations are scoped to one person.
 */
export interface HealthRepository {
  getProfile(): Promise<HealthProfile | null>;
  saveProfile(fields: ProfileFields): Promise<void>;
  updateProfile(patch: Partial<ProfileFields>): Promise<void>;

  listWeighIns(range?: DateRange): Promise<WeighIn[]>;
  saveWeighIn(onDate: CalendarDate, weightKg: number, note: string | null): Promise<void>;
  deleteWeighIn(id: string): Promise<void>;

  listFoodLogs(range: DateRange): Promise<FoodLog[]>;
  getFoodLog(id: string): Promise<FoodLog | null>;
  addFoodLogs(rows: NewFoodLog[]): Promise<void>;
  updateFoodLog(id: string, patch: Partial<NewFoodLog>): Promise<void>;
  deleteFoodLog(id: string): Promise<void>;
  /** Every day with at least one food log (for streaks). */
  foodLogDays(): Promise<CalendarDate[]>;
  /** Most recently logged distinct foods, for one-tap re-logging. */
  recentFoods(limit: number): Promise<FoodLog[]>;

  listCustomFoods(): Promise<CustomFood[]>;
  saveCustomFood(food: Omit<CustomFood, "id" | "archivedAt"> & { id?: string }): Promise<string>;
  archiveCustomFood(id: string): Promise<void>;

  listSavedMeals(): Promise<SavedMeal[]>;
  saveSavedMeal(name: string, items: MealItem[]): Promise<string>;
  deleteSavedMeal(id: string): Promise<void>;

  listWater(range: DateRange): Promise<WaterDay[]>;
  setWater(onDate: CalendarDate, totalMl: number): Promise<void>;

  listMeasurements(range?: DateRange): Promise<Measurement[]>;
  saveMeasurement(m: Omit<Measurement, "id">): Promise<void>;
  deleteMeasurement(id: string): Promise<void>;

  listCustomWorkouts(): Promise<CustomWorkout[]>;
  getCustomWorkout(id: string): Promise<CustomWorkout | null>;
  saveCustomWorkout(w: Omit<CustomWorkout, "id"> & { id?: string }): Promise<string>;
  deleteCustomWorkout(id: string): Promise<void>;

  listSessions(range?: DateRange & { limit?: number }): Promise<WorkoutSession[]>;
  getSession(id: string): Promise<WorkoutSession | null>;
  getOpenSession(): Promise<WorkoutSession | null>;
  createSession(s: Omit<WorkoutSession, "id" | "startedAt" | "finishedAt">): Promise<string>;
  updateSession(id: string, patch: Partial<Pick<WorkoutSession, "name" | "notes" | "finishedAt" | "onDate">>): Promise<void>;
  deleteSession(id: string): Promise<void>;

  listSets(filter: { sessionIds?: string[]; exerciseKey?: string }): Promise<WorkoutSet[]>;
  addSet(s: Omit<WorkoutSet, "id">): Promise<string>;
  updateSet(id: string, patch: Partial<Omit<WorkoutSet, "id" | "sessionId">>): Promise<void>;
  deleteSet(id: string): Promise<void>;

  listAchievements(): Promise<Achievement[]>;
  addAchievements(rows: { badgeKey: string; earnedOn: CalendarDate }[]): Promise<void>;
  markAchievementsSeen(): Promise<void>;

  exportAll(): Promise<HealthExport>;
  importAll(data: HealthExport): Promise<void>;
  resetAll(): Promise<void>;
}
