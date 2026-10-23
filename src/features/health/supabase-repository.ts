import "server-only";
import { dbErrorMessage, logServerError } from "@/lib/actions";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";
import { HealthStoreError } from "./errors";
import type { DateRange, HealthRepository } from "./repository";
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

export { HealthStoreError };

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string };
/** The few filter methods the helpers below add (kept structural to keep the types shallow). */
type Filterable = {
  eq(column: string, value: string): Filterable;
  gte(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const PROFILE_COLUMNS: Record<keyof ProfileFields, string> = {
  sex: "sex",
  ageYears: "age_years",
  ageSetOn: "age_set_on",
  heightCm: "height_cm",
  activityLevel: "activity_level",
  units: "units",
  goal: "goal",
  startWeightKg: "start_weight_kg",
  startDate: "start_date",
  targetWeightKg: "target_weight_kg",
  targetDate: "target_date",
  dietPlan: "diet_plan",
  fastingProtocol: "fasting_protocol",
  fastStartedAt: "fast_started_at",
  waterGoalMl: "water_goal_ml",
  activeProgram: "active_program",
  programStartedOn: "program_started_on",
  reminders: "reminders",
};

function toProfile(r: Row): HealthProfile {
  return {
    id: String(r.id),
    sex: r.sex as HealthProfile["sex"],
    ageYears: Number(r.age_years),
    ageSetOn: String(r.age_set_on),
    heightCm: Number(r.height_cm),
    activityLevel: r.activity_level as HealthProfile["activityLevel"],
    units: r.units as HealthProfile["units"],
    goal: r.goal as HealthProfile["goal"],
    startWeightKg: Number(r.start_weight_kg),
    startDate: String(r.start_date),
    targetWeightKg: num(r.target_weight_kg),
    targetDate: str(r.target_date),
    dietPlan: str(r.diet_plan),
    fastingProtocol: (r.fasting_protocol as HealthProfile["fastingProtocol"]) ?? null,
    fastStartedAt: str(r.fast_started_at),
    waterGoalMl: Number(r.water_goal_ml),
    activeProgram: str(r.active_program),
    programStartedOn: str(r.program_started_on),
    reminders: (r.reminders as HealthProfile["reminders"]) ?? {},
  };
}

function profileRow(fields: Partial<ProfileFields>): Row {
  const out: Row = {};
  for (const [key, column] of Object.entries(PROFILE_COLUMNS)) {
    const value = fields[key as keyof ProfileFields];
    if (value !== undefined) out[column] = value;
  }
  return out;
}

const nutrition = (r: Row) => ({
  calories: Number(r.calories),
  proteinG: Number(r.protein_g),
  carbsG: Number(r.carbs_g),
  fatG: Number(r.fat_g),
});

const toFoodLog = (r: Row): FoodLog => ({
  id: String(r.id),
  onDate: String(r.on_date),
  meal: r.meal as FoodLog["meal"],
  name: String(r.name),
  source: r.source as FoodLog["source"],
  foodRef: str(r.food_ref),
  servings: Number(r.servings),
  ...nutrition(r),
});

const foodLogRow = (l: Partial<NewFoodLog>): Row => {
  const out: Row = {
    on_date: l.onDate,
    meal: l.meal,
    name: l.name,
    source: l.source,
    food_ref: l.foodRef,
    servings: l.servings,
    calories: l.calories,
    protein_g: l.proteinG,
    carbs_g: l.carbsG,
    fat_g: l.fatG,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
};

const toMeasurement = (r: Row): Measurement => ({
  id: String(r.id),
  onDate: String(r.on_date),
  waistCm: num(r.waist_cm),
  chestCm: num(r.chest_cm),
  hipsCm: num(r.hips_cm),
  armCm: num(r.arm_cm),
  thighCm: num(r.thigh_cm),
});

const toSession = (r: Row): WorkoutSession => ({
  id: String(r.id),
  onDate: String(r.on_date),
  name: String(r.name),
  programKey: str(r.program_key),
  programDay: num(r.program_day),
  customWorkoutId: str(r.custom_workout_id),
  startedAt: String(r.started_at),
  finishedAt: str(r.finished_at),
  notes: str(r.notes),
});

const toSet = (r: Row): WorkoutSet => ({
  id: String(r.id),
  sessionId: String(r.session_id),
  exerciseKey: String(r.exercise_key),
  position: Number(r.position),
  setNumber: Number(r.set_number),
  reps: num(r.reps),
  weightKg: num(r.weight_kg),
  durationS: num(r.duration_s),
  note: str(r.note),
});

const toCustomWorkout = (r: Row): CustomWorkout => ({
  id: String(r.id),
  name: String(r.name),
  notes: str(r.notes),
  exercises: (r.exercises as CustomWorkout["exercises"]) ?? [],
});

/** Column lists for the export file (everything but owner and bookkeeping columns). */
const EXPORT_COLUMNS = {
  weigh_ins: "on_date, weight_kg, note",
  foods: "id, name, serving, calories, protein_g, carbs_g, fat_g, archived_at",
  saved_meals: "name, items",
  food_logs: "on_date, meal, name, source, food_ref, servings, calories, protein_g, carbs_g, fat_g",
  water: "on_date, total_ml",
  measurements: "on_date, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm",
  custom_workouts: "id, name, notes, exercises",
  workout_sessions: "id, on_date, name, program_key, program_day, custom_workout_id, started_at, finished_at, notes",
  workout_sets: "session_id, exercise_key, position, set_number, reps, weight_kg, duration_s, note",
  achievements: "badge_key, earned_on, seen_at",
} as const;

const TABLES: Record<keyof typeof EXPORT_COLUMNS, string> = {
  weigh_ins: "health_weigh_ins",
  foods: "health_foods",
  saved_meals: "health_saved_meals",
  food_logs: "health_food_logs",
  water: "health_water",
  measurements: "health_measurements",
  custom_workouts: "health_custom_workouts",
  workout_sessions: "health_workout_sessions",
  workout_sets: "health_workout_sets",
  achievements: "health_achievements",
};

export class SupabaseHealthRepository implements HealthRepository {
  constructor(private readonly ctx: HouseholdContext) {}

  private get db() {
    return this.ctx.supabase;
  }

  /** Every query is narrowed to this person in this household (RLS enforces it too). */
  private from(table: string) {
    return this.db.from(table);
  }

  private own<T>(q: T): T {
    return (q as unknown as Filterable).eq("household_id", this.ctx.household.id).eq("user_id", this.ctx.userId) as unknown as T;
  }

  private owner() {
    return { household_id: this.ctx.household.id, user_id: this.ctx.userId };
  }

  private check(scope: string, error: DbError | null): void {
    if (!error) return;
    logServerError(`health:${scope}`, error);
    throw new HealthStoreError(dbErrorMessage(error));
  }

  private range<T>(q: T, r?: DateRange, column = "on_date"): T {
    let out = q as unknown as Filterable;
    if (r?.from) out = out.gte(column, r.from);
    if (r?.to) out = out.lte(column, r.to);
    return out as unknown as T;
  }

  /** Reads every matching row, 1,000 at a time (the API's page size). `make` must add a unique ordering. */
  private async all(scope: string, make: () => PromiseLike<{ data: Row[] | null; error: DbError | null }> & { range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: DbError | null }> }): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await make().range(from, from + 999);
      this.check(scope, error);
      out.push(...(data ?? []));
      if ((data ?? []).length < 1000) return out;
    }
  }

  // Profile ---------------------------------------------------------------
  async getProfile() {
    const { data, error } = await this.own(this.from("health_profiles").select("*")).maybeSingle();
    this.check("profile", error);
    return data ? toProfile(data) : null;
  }

  async saveProfile(fields: ProfileFields) {
    const { error } = await this.from("health_profiles").upsert(
      { ...this.owner(), ...profileRow(fields) },
      { onConflict: "household_id,user_id" },
    );
    this.check("saveProfile", error);
  }

  async updateProfile(patch: Partial<ProfileFields>) {
    const { error } = await this.own(this.from("health_profiles").update(profileRow(patch)));
    this.check("updateProfile", error);
  }

  // Weigh-ins ---------------------------------------------------------------
  async listWeighIns(r?: DateRange): Promise<WeighIn[]> {
    const rows = await this.all("weighIns", () =>
      this.range(this.own(this.from("health_weigh_ins").select("id, on_date, weight_kg, note")), r).order("on_date"),
    );
    return rows.map((x) => ({ id: String(x.id), onDate: String(x.on_date), weightKg: Number(x.weight_kg), note: str(x.note) }));
  }

  async saveWeighIn(onDate: CalendarDate, weightKg: number, note: string | null) {
    const { error } = await this.from("health_weigh_ins").upsert(
      { ...this.owner(), on_date: onDate, weight_kg: weightKg, note },
      { onConflict: "household_id,user_id,on_date" },
    );
    this.check("saveWeighIn", error);
  }

  async deleteWeighIn(id: string) {
    const { error } = await this.own(this.from("health_weigh_ins").delete().eq("id", id));
    this.check("deleteWeighIn", error);
  }

  // Food ---------------------------------------------------------------------
  async listFoodLogs(r: DateRange): Promise<FoodLog[]> {
    const rows = await this.all("foodLogs", () =>
      this.range(this.own(this.from("health_food_logs").select("*")), r).order("on_date").order("created_at").order("id"),
    );
    return rows.map(toFoodLog);
  }

  async foodLogDays(): Promise<CalendarDate[]> {
    const rows = await this.all("foodLogDays", () => this.own(this.from("health_food_logs").select("on_date")).order("on_date").order("id"));
    return [...new Set(rows.map((r) => String(r.on_date)))];
  }

  async getFoodLog(id: string) {
    const { data, error } = await this.own(this.from("health_food_logs").select("*").eq("id", id)).maybeSingle();
    this.check("foodLog", error);
    return data ? toFoodLog(data) : null;
  }

  async addFoodLogs(rows: NewFoodLog[]) {
    if (!rows.length) return;
    const { error } = await this.from("health_food_logs").insert(rows.map((l) => ({ ...this.owner(), ...foodLogRow(l) })));
    this.check("addFoodLogs", error);
  }

  async updateFoodLog(id: string, patch: Partial<NewFoodLog>) {
    const { error } = await this.own(this.from("health_food_logs").update(foodLogRow(patch)).eq("id", id));
    this.check("updateFoodLog", error);
  }

  async deleteFoodLog(id: string) {
    const { error } = await this.own(this.from("health_food_logs").delete().eq("id", id));
    this.check("deleteFoodLog", error);
  }

  async recentFoods(limit: number): Promise<FoodLog[]> {
    const { data, error } = await this.own(this.from("health_food_logs").select("*"))
      .neq("source", "quick")
      .order("created_at", { ascending: false })
      .limit(200);
    this.check("recentFoods", error);
    const seen = new Set<string>();
    const out: FoodLog[] = [];
    for (const row of data ?? []) {
      const log = toFoodLog(row);
      const key = `${log.source}:${log.foodRef ?? log.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(log);
      if (out.length >= limit) break;
    }
    return out;
  }

  async listCustomFoods(): Promise<CustomFood[]> {
    const { data, error } = await this.own(this.from("health_foods").select("*")).is("archived_at", null).order("name");
    this.check("customFoods", error);
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, serving: r.serving, archivedAt: r.archived_at, ...nutrition(r) }));
  }

  async saveCustomFood(food: Omit<CustomFood, "id" | "archivedAt"> & { id?: string }) {
    const row = { name: food.name, serving: food.serving, calories: food.calories, protein_g: food.proteinG, carbs_g: food.carbsG, fat_g: food.fatG };
    const res = food.id
      ? await this.own(this.from("health_foods").update(row).eq("id", food.id)).select("id").single()
      : await this.from("health_foods").insert({ ...this.owner(), ...row }).select("id").single();
    this.check("saveCustomFood", res.error);
    return String(res.data?.id);
  }

  async archiveCustomFood(id: string) {
    const { error } = await this.own(this.from("health_foods").update({ archived_at: new Date().toISOString() }).eq("id", id));
    this.check("archiveCustomFood", error);
  }

  async listSavedMeals(): Promise<SavedMeal[]> {
    const { data, error } = await this.own(this.from("health_saved_meals").select("id, name, items")).order("name");
    this.check("savedMeals", error);
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, items: r.items as MealItem[] }));
  }

  async saveSavedMeal(name: string, items: MealItem[]) {
    const { data, error } = await this.from("health_saved_meals").insert({ ...this.owner(), name, items }).select("id").single();
    this.check("saveSavedMeal", error);
    return String(data?.id);
  }

  async deleteSavedMeal(id: string) {
    const { error } = await this.own(this.from("health_saved_meals").delete().eq("id", id));
    this.check("deleteSavedMeal", error);
  }

  // Water --------------------------------------------------------------------
  async listWater(r: DateRange): Promise<WaterDay[]> {
    const rows = await this.all("water", () => this.range(this.own(this.from("health_water").select("on_date, total_ml")), r).order("on_date"));
    return rows.map((x) => ({ onDate: String(x.on_date), totalMl: Number(x.total_ml) }));
  }

  async setWater(onDate: CalendarDate, totalMl: number) {
    const { error } = await this.from("health_water").upsert(
      { ...this.owner(), on_date: onDate, total_ml: totalMl },
      { onConflict: "household_id,user_id,on_date" },
    );
    this.check("setWater", error);
  }

  // Measurements ---------------------------------------------------------------
  async listMeasurements(r?: DateRange): Promise<Measurement[]> {
    const rows = await this.all("measurements", () => this.range(this.own(this.from("health_measurements").select("*")), r).order("on_date"));
    return rows.map(toMeasurement);
  }

  async saveMeasurement(m: Omit<Measurement, "id">) {
    const { error } = await this.from("health_measurements").upsert(
      {
        ...this.owner(),
        on_date: m.onDate,
        waist_cm: m.waistCm,
        chest_cm: m.chestCm,
        hips_cm: m.hipsCm,
        arm_cm: m.armCm,
        thigh_cm: m.thighCm,
      },
      { onConflict: "household_id,user_id,on_date" },
    );
    this.check("saveMeasurement", error);
  }

  async deleteMeasurement(id: string) {
    const { error } = await this.own(this.from("health_measurements").delete().eq("id", id));
    this.check("deleteMeasurement", error);
  }

  // Custom workouts -------------------------------------------------------------
  async listCustomWorkouts(): Promise<CustomWorkout[]> {
    const { data, error } = await this.own(this.from("health_custom_workouts").select("id, name, notes, exercises")).order("name");
    this.check("customWorkouts", error);
    return (data ?? []).map(toCustomWorkout);
  }

  async getCustomWorkout(id: string) {
    const { data, error } = await this.own(this.from("health_custom_workouts").select("id, name, notes, exercises").eq("id", id)).maybeSingle();
    this.check("customWorkout", error);
    return data ? toCustomWorkout(data) : null;
  }

  async saveCustomWorkout(w: Omit<CustomWorkout, "id"> & { id?: string }) {
    const row = { name: w.name, notes: w.notes, exercises: w.exercises };
    const res = w.id
      ? await this.own(this.from("health_custom_workouts").update(row).eq("id", w.id)).select("id").single()
      : await this.from("health_custom_workouts").insert({ ...this.owner(), ...row }).select("id").single();
    this.check("saveCustomWorkout", res.error);
    return String(res.data?.id);
  }

  async deleteCustomWorkout(id: string) {
    const { error } = await this.own(this.from("health_custom_workouts").delete().eq("id", id));
    this.check("deleteCustomWorkout", error);
  }

  // Sessions and sets -------------------------------------------------------------
  async listSessions(r?: DateRange & { limit?: number }): Promise<WorkoutSession[]> {
    const make = () =>
      this.range(this.own(this.from("health_workout_sessions").select("*")), r)
        .order("on_date", { ascending: false })
        .order("started_at", { ascending: false })
        .order("id");
    if (r?.limit) {
      const { data, error } = await make().limit(r.limit);
      this.check("sessions", error);
      return (data ?? []).map(toSession);
    }
    return (await this.all("sessions", make)).map(toSession);
  }

  async getSession(id: string) {
    const { data, error } = await this.own(this.from("health_workout_sessions").select("*").eq("id", id)).maybeSingle();
    this.check("session", error);
    return data ? toSession(data) : null;
  }

  async getOpenSession() {
    const { data, error } = await this.own(this.from("health_workout_sessions").select("*"))
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    this.check("openSession", error);
    return data ? toSession(data) : null;
  }

  async createSession(s: Omit<WorkoutSession, "id" | "startedAt" | "finishedAt">) {
    const { data, error } = await this.from("health_workout_sessions")
      .insert({
        ...this.owner(),
        on_date: s.onDate,
        name: s.name,
        program_key: s.programKey,
        program_day: s.programDay,
        custom_workout_id: s.customWorkoutId,
        notes: s.notes,
      })
      .select("id")
      .single();
    this.check("createSession", error);
    return String(data?.id);
  }

  async updateSession(id: string, patch: Partial<Pick<WorkoutSession, "name" | "notes" | "finishedAt" | "onDate">>) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
    if (patch.onDate !== undefined) row.on_date = patch.onDate;
    const { error } = await this.own(this.from("health_workout_sessions").update(row).eq("id", id));
    this.check("updateSession", error);
  }

  async deleteSession(id: string) {
    const { error } = await this.own(this.from("health_workout_sessions").delete().eq("id", id));
    this.check("deleteSession", error);
  }

  async listSets(filter: { sessionIds?: string[]; exerciseKey?: string }): Promise<WorkoutSet[]> {
    if (filter.sessionIds && !filter.sessionIds.length) return [];
    // Long id lists would make an over-long URL; past ~100 sessions, read all and filter here.
    const inUrl = filter.sessionIds && filter.sessionIds.length <= 100 ? filter.sessionIds : null;
    const rows = await this.all("sets", () => {
      let q = this.own(this.from("health_workout_sets").select("*"));
      if (inUrl) q = q.in("session_id", inUrl);
      if (filter.exerciseKey) q = q.eq("exercise_key", filter.exerciseKey);
      return q.order("position").order("set_number").order("id");
    });
    const wanted = filter.sessionIds && !inUrl ? new Set(filter.sessionIds) : null;
    return rows.filter((r) => !wanted || wanted.has(String(r.session_id))).map(toSet);
  }

  async addSet(s: Omit<WorkoutSet, "id">) {
    const { data, error } = await this.from("health_workout_sets")
      .insert({
        ...this.owner(),
        session_id: s.sessionId,
        exercise_key: s.exerciseKey,
        position: s.position,
        set_number: s.setNumber,
        reps: s.reps,
        weight_kg: s.weightKg,
        duration_s: s.durationS,
        note: s.note,
      })
      .select("id")
      .single();
    this.check("addSet", error);
    return String(data?.id);
  }

  async updateSet(id: string, patch: Partial<Omit<WorkoutSet, "id" | "sessionId">>) {
    const map: Record<string, string> = {
      exerciseKey: "exercise_key",
      position: "position",
      setNumber: "set_number",
      reps: "reps",
      weightKg: "weight_kg",
      durationS: "duration_s",
      note: "note",
    };
    const row: Row = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined && map[k]) row[map[k]] = v;
    const { error } = await this.own(this.from("health_workout_sets").update(row).eq("id", id));
    this.check("updateSet", error);
  }

  async deleteSet(id: string) {
    const { error } = await this.own(this.from("health_workout_sets").delete().eq("id", id));
    this.check("deleteSet", error);
  }

  // Achievements -------------------------------------------------------------------
  async listAchievements(): Promise<Achievement[]> {
    const { data, error } = await this.own(this.from("health_achievements").select("badge_key, earned_on, seen_at")).order("earned_on");
    this.check("achievements", error);
    return (data ?? []).map((r) => ({ badgeKey: r.badge_key, earnedOn: r.earned_on, seenAt: r.seen_at }));
  }

  async addAchievements(rows: { badgeKey: string; earnedOn: CalendarDate }[]) {
    if (!rows.length) return;
    const { error } = await this.from("health_achievements").upsert(
      rows.map((r) => ({ ...this.owner(), badge_key: r.badgeKey, earned_on: r.earnedOn })),
      { onConflict: "household_id,user_id,badge_key", ignoreDuplicates: true },
    );
    this.check("addAchievements", error);
  }

  async markAchievementsSeen() {
    const { error } = await this.own(this.from("health_achievements").update({ seen_at: new Date().toISOString() })).is("seen_at", null);
    this.check("markAchievementsSeen", error);
  }

  // Data -----------------------------------------------------------------------------
  async exportAll(): Promise<HealthExport> {
    const { data: profile, error } = await this.own(
      this.from("health_profiles").select(
        "sex, age_years, age_set_on, height_cm, activity_level, units, goal, start_weight_kg, start_date, target_weight_kg, target_date, diet_plan, fasting_protocol, water_goal_ml, active_program, program_started_on, reminders",
      ),
    ).maybeSingle();
    this.check("export:profile", error);
    const tables = {} as Record<keyof typeof EXPORT_COLUMNS, Row[]>;
    for (const key of Object.keys(EXPORT_COLUMNS) as (keyof typeof EXPORT_COLUMNS)[]) {
      const rows: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await this.own(this.from(TABLES[key]).select(EXPORT_COLUMNS[key]))
          .order("id")
          .range(from, from + 999);
        this.check(`export:${key}`, e);
        rows.push(...((data ?? []) as unknown as Row[]));
        if ((data ?? []).length < 1000) break;
      }
      tables[key] = rows;
    }
    return { format: "ward-health-export", version: 1, exported_at: new Date().toISOString(), profile: profile ?? null, ...tables };
  }

  async importAll(data: HealthExport) {
    const { error } = await this.db.rpc("health_import", { p_household_id: this.ctx.household.id, p_data: data });
    this.check("import", error);
  }

  async resetAll() {
    const { error } = await this.db.rpc("health_reset", { p_household_id: this.ctx.household.id });
    this.check("reset", error);
  }
}
