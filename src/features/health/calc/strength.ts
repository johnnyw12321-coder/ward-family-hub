import type { ExerciseKind } from "../catalog/exercises";

/**
 * Strength maths: estimated one-rep max, personal records and progressive
 * overload suggestions.
 */
type SetLike = { reps: number | null; weightKg: number | null; durationS: number | null };

/** Epley estimate of a one-rep max. Reliable up to ~12 reps; capped beyond that. */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + Math.min(reps, 12) / 30) * 10) / 10;
}

export type Bests = { heaviestKg: number; bestE1rm: number; mostReps: number; longestS: number; volumeKg: number };

export const EMPTY_BESTS: Bests = { heaviestKg: 0, bestE1rm: 0, mostReps: 0, longestS: 0, volumeKg: 0 };

export function bests(sets: SetLike[]): Bests {
  const out = { ...EMPTY_BESTS };
  for (const s of sets) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    out.heaviestKg = Math.max(out.heaviestKg, r > 0 ? w : 0);
    out.bestE1rm = Math.max(out.bestE1rm, estimatedOneRepMax(w, r));
    out.mostReps = Math.max(out.mostReps, r);
    out.longestS = Math.max(out.longestS, s.durationS ?? 0);
    out.volumeKg += w * r;
  }
  return out;
}

export type PersonalRecord = { kind: "weight" | "e1rm" | "reps" | "time"; label: string };

/**
 * Records a new set sets against everything before it. The first ever set of
 * an exercise isn't a "record" — there's nothing to beat yet.
 */
export function detectRecords(set: SetLike, before: Bests, kind: ExerciseKind, hasHistory: boolean): PersonalRecord[] {
  if (!hasHistory) return [];
  const out: PersonalRecord[] = [];
  const w = set.weightKg ?? 0;
  const r = set.reps ?? 0;
  if (kind === "weight" && r > 0 && w > 0) {
    if (w > before.heaviestKg) out.push({ kind: "weight", label: "Heaviest weight" });
    else if (estimatedOneRepMax(w, r) > before.bestE1rm) out.push({ kind: "e1rm", label: "Best estimated 1RM" });
  } else if (kind === "reps" && r > before.mostReps) {
    out.push({ kind: "reps", label: "Most reps" });
  } else if (kind === "time" && (set.durationS ?? 0) > before.longestS) {
    out.push({ kind: "time", label: "Longest time" });
  }
  return out;
}

export type Suggestion = { weightKg: number | null; reps: number | null; durationS: number | null; message: string };

/** Smallest practical jump: 2.5 kg upper body, 5 kg lower body (half for dumbbells, which go up per hand). */
export function weightStep(lower: boolean, dumbbell: boolean): number {
  const step = lower ? 5 : 2.5;
  return dumbbell ? step / 2 : step;
}

/**
 * Double progression: once every working set reaches the top of the rep
 * range, add weight next time; otherwise keep the weight and add reps.
 * Bodyweight moves add reps; timed moves add 5 seconds.
 */
export function overloadSuggestion(
  lastSets: SetLike[],
  target: { low: number; high: number },
  ex: { kind: ExerciseKind; lower: boolean; dumbbell: boolean },
  formatKg: (kg: number) => string = (kg) => `${kg} kg`,
): Suggestion | null {
  const working = lastSets.filter((s) => (s.reps ?? 0) > 0 || (s.durationS ?? 0) > 0);
  if (!working.length) return null;
  if (ex.kind === "time") {
    const best = Math.max(...working.map((s) => s.durationS ?? 0));
    return { weightKg: null, reps: null, durationS: best + 5, message: `Last time ${best} s — try ${best + 5} s.` };
  }
  if (ex.kind === "reps") {
    const best = Math.max(...working.map((s) => s.reps ?? 0));
    return { weightKg: null, reps: best + 1, durationS: null, message: `Last time ${best} reps — go for ${best + 1}.` };
  }
  const top = Math.max(...working.map((s) => s.weightKg ?? 0));
  const atTop = working.filter((s) => (s.weightKg ?? 0) === top);
  const allHitTop = atTop.every((s) => (s.reps ?? 0) >= target.high);
  if (allHitTop && top > 0) {
    const next = Math.round((top + weightStep(ex.lower, ex.dumbbell)) * 100) / 100;
    return { weightKg: next, reps: target.low, durationS: null, message: `You hit ${target.high} reps on every set — add weight: ${formatKg(next)} × ${target.low}.` };
  }
  const minReps = Math.min(...atTop.map((s) => s.reps ?? 0));
  const reps = Math.min(target.high, Math.max(target.low, minReps + 1));
  return { weightKg: top || null, reps, durationS: null, message: `Stay at ${formatKg(top)} and aim for ${reps} reps on each set.` };
}
