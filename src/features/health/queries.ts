import "server-only";
import { addDays, type CalendarDate } from "@/lib/dates";
import { BADGE_BY_KEY, earnedBadges, type Badge, type BadgeStats } from "./calc/achievements";
import { profilePlan, type EnergyPlan } from "./calc/energy";
import { macroTargets, type MacroTargets } from "./calc/macros";
import { currentStreak, longestStreak } from "./calc/streaks";
import { bests, detectRecords, EMPTY_BESTS, type Bests } from "./calc/strength";
import { goalProgress, movingAverage } from "./calc/trend";
import { effectivePlan, type DietPlan } from "./catalog/diet-plans";
import { exercise } from "./catalog/exercises";
import { program, type Program, type ProgramExercise } from "./catalog/programs";
import type { HealthRepository } from "./repository";
import type { HealthProfile, WeighIn, WorkoutSession, WorkoutSet } from "./types";

/** The latest weigh-in on or before a day, falling back to the starting weight. */
export function weightOn(weighIns: WeighIn[], profile: HealthProfile, day: CalendarDate): number {
  let latest: WeighIn | undefined;
  for (const w of weighIns) if (w.onDate <= day && (!latest || w.onDate > latest.onDate)) latest = w;
  return latest?.weightKg ?? profile.startWeightKg;
}

export type Targets = { plan: EnergyPlan; diet: DietPlan; macros: MacroTargets; weightKg: number };

/** Calorie and macro targets at the person's latest weight. */
export function targetsFor(profile: HealthProfile, weightKg: number, today: CalendarDate): Targets {
  const plan = profilePlan(profile, weightKg, today);
  const diet = effectivePlan(profile.dietPlan, profile.goal);
  return { plan, diet, macros: macroTargets(plan.target, diet.macros, weightKg), weightKg };
}

export async function loadTargets(repo: HealthRepository, profile: HealthProfile, today: CalendarDate): Promise<Targets> {
  const recent = await repo.listWeighIns({ from: addDays(today, -60), to: today });
  return targetsFor(profile, weightOn(recent, profile, today), today);
}

/**
 * Personal records over a set history, replayed in order: each set is checked
 * against everything before it. Returns the count (one per exercise per
 * workout), the sets that set a record, and current bests.
 */
export function replayRecords(sessions: WorkoutSession[], sets: WorkoutSet[]): { count: number; bests: Map<string, Bests>; recordSetIds: Set<string> } {
  const order = new Map(
    [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((s, i) => [s.id, i]),
  );
  const sorted = sets
    .filter((s) => order.has(s.sessionId))
    .sort((a, b) => order.get(a.sessionId)! - order.get(b.sessionId)! || a.position - b.position || a.setNumber - b.setNumber);
  const best = new Map<string, Bests>();
  const seenIn = new Map<string, string>(); // exercise → first session it appeared in
  const recordSetIds = new Set<string>();
  const counted = new Set<string>();
  let count = 0;
  for (const s of sorted) {
    const ex = exercise(s.exerciseKey);
    const before = best.get(s.exerciseKey) ?? EMPTY_BESTS;
    const first = seenIn.get(s.exerciseKey);
    const hasHistory = first !== undefined && first !== s.sessionId;
    if (ex && detectRecords(s, before, ex.kind, hasHistory).length) {
      // A record counts once per exercise per workout, however many sets beat it.
      if (!counted.has(`${s.sessionId}:${s.exerciseKey}`)) count++;
      counted.add(`${s.sessionId}:${s.exerciseKey}`);
      recordSetIds.add(s.id);
    }
    if (first === undefined) seenIn.set(s.exerciseKey, s.sessionId);
    const merged = bests([s]);
    best.set(s.exerciseKey, {
      heaviestKg: Math.max(before.heaviestKg, merged.heaviestKg),
      bestE1rm: Math.max(before.bestE1rm, merged.bestE1rm),
      mostReps: Math.max(before.mostReps, merged.mostReps),
      longestS: Math.max(before.longestS, merged.longestS),
      volumeKg: before.volumeKg + merged.volumeKg,
    });
  }
  return { count, bests: best, recordSetIds };
}

export type Overview = {
  stats: BadgeStats;
  streak: number;
  activityDays: CalendarDate[];
  weighIns: WeighIn[];
  trend: { onDate: CalendarDate; avgKg: number }[];
  sessions: WorkoutSession[];
};

/** Everything streaks, badges and the dashboard's long-range numbers need. */
export async function loadOverview(repo: HealthRepository, profile: HealthProfile, today: CalendarDate): Promise<Overview> {
  const [weighIns, foodDays, water, measurements, sessions] = await Promise.all([
    repo.listWeighIns(),
    repo.foodLogDays(),
    repo.listWater({}),
    repo.listMeasurements(),
    repo.listSessions(),
  ]);
  const finished = sessions.filter((s) => s.finishedAt);
  const sets = await repo.listSets({ sessionIds: finished.map((s) => s.id) });
  const trend = movingAverage(weighIns);
  const activityDays = [...new Set([...foodDays, ...weighIns.map((w) => w.onDate), ...finished.map((s) => s.onDate)])];
  const latest = trend.at(-1)?.avgKg ?? profile.startWeightKg;
  return {
    stats: {
      weighIns: weighIns.length,
      foodLogDays: foodDays.length,
      longestStreak: longestStreak(activityDays),
      workouts: finished.length,
      records: replayRecords(finished, sets).count,
      waterGoalDays: water.filter((w) => w.totalMl >= profile.waterGoalMl).length,
      measurements: measurements.length,
      goalProgress:
        profile.targetWeightKg !== null && profile.goal !== "maintain" ? goalProgress(profile.startWeightKg, latest, profile.targetWeightKg) : null,
    },
    streak: currentStreak(activityDays, today),
    activityDays,
    weighIns,
    trend,
    sessions,
  };
}

/** Stores newly earned badges and returns them, for a celebration. */
export async function syncAchievements(repo: HealthRepository, profile: HealthProfile, today: CalendarDate): Promise<Badge[]> {
  const [overview, stored] = await Promise.all([loadOverview(repo, profile, today), repo.listAchievements()]);
  const have = new Set(stored.map((a) => a.badgeKey));
  const fresh = earnedBadges(overview.stats).filter((k) => !have.has(k));
  await repo.addAchievements(fresh.map((badgeKey) => ({ badgeKey, earnedOn: today })));
  return fresh.map((k) => BADGE_BY_KEY.get(k)!).filter(Boolean);
}

// Workouts --------------------------------------------------------------------------

/** The program day after the last one finished (round-robin through the program). */
export function nextProgramDay(prog: Program, sessions: WorkoutSession[]): number {
  const last = sessions
    .filter((s) => s.finishedAt && s.programKey === prog.key && s.programDay !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return last ? (last.programDay! + 1) % prog.days.length : 0;
}

/** What a session was planned to include: its program day or custom workout. */
export async function sessionPlan(repo: HealthRepository, session: WorkoutSession): Promise<ProgramExercise[]> {
  if (session.programKey !== null && session.programDay !== null) return program(session.programKey)?.days[session.programDay]?.exercises ?? [];
  if (session.customWorkoutId) return (await repo.getCustomWorkout(session.customWorkoutId))?.exercises ?? [];
  return [];
}

/** For each exercise: every set ever, the sets from the most recent other finished session, and its date. */
export async function exerciseHistory(
  repo: HealthRepository,
  keys: string[],
  sessions: WorkoutSession[],
  excludeSessionId?: string,
): Promise<Map<string, { all: WorkoutSet[]; last: WorkoutSet[]; lastDate: CalendarDate | null }>> {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const unique = [...new Set(keys)];
  const lists = await Promise.all(unique.map((k) => repo.listSets({ exerciseKey: k })));
  const out = new Map<string, { all: WorkoutSet[]; last: WorkoutSet[]; lastDate: CalendarDate | null }>();
  unique.forEach((key, i) => {
    const all = lists[i].filter((s) => byId.get(s.sessionId)?.finishedAt && s.sessionId !== excludeSessionId);
    const latest = [...new Set(all.map((s) => s.sessionId))].map((id) => byId.get(id)!).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    out.set(key, {
      all,
      last: latest ? all.filter((s) => s.sessionId === latest.id).sort((a, b) => a.setNumber - b.setNumber) : [],
      lastDate: latest?.onDate ?? null,
    });
  });
  return out;
}
