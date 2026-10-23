/**
 * Badges and milestones. Earned badges are stored once (with the day they
 * were earned) so the celebration shows exactly once, even if a later edit
 * means the condition no longer holds.
 */
export type BadgeIcon = "scale" | "utensils" | "flame" | "dumbbell" | "trophy" | "droplet" | "ruler" | "target" | "medal";

export type Badge = { key: string; name: string; description: string; icon: BadgeIcon };

export type BadgeStats = {
  weighIns: number;
  foodLogDays: number;
  longestStreak: number;
  workouts: number;
  records: number;
  waterGoalDays: number;
  measurements: number;
  /** 0–1 progress from start weight to target; null without a target. */
  goalProgress: number | null;
};

const B = (key: string, name: string, description: string, icon: BadgeIcon, earned: (s: BadgeStats) => boolean) => ({
  badge: { key, name, description, icon },
  earned,
});

const RULES = [
  B("first_weigh_in", "First weigh-in", "Logged your first weight", "scale", (s) => s.weighIns >= 1),
  B("weigh_ins_30", "Steady scale", "30 weigh-ins logged", "scale", (s) => s.weighIns >= 30),
  B("first_meal", "First bite", "Logged your first meal", "utensils", (s) => s.foodLogDays >= 1),
  B("streak_3", "Three in a row", "Logged something 3 days in a row", "flame", (s) => s.longestStreak >= 3),
  B("streak_7", "Week warrior", "A 7-day logging streak", "flame", (s) => s.longestStreak >= 7),
  B("streak_30", "Habit formed", "A 30-day logging streak", "flame", (s) => s.longestStreak >= 30),
  B("first_workout", "First workout", "Finished your first workout", "dumbbell", (s) => s.workouts >= 1),
  B("workouts_10", "Ten down", "10 workouts finished", "dumbbell", (s) => s.workouts >= 10),
  B("workouts_25", "Committed", "25 workouts finished", "dumbbell", (s) => s.workouts >= 25),
  B("workouts_50", "Iron regular", "50 workouts finished", "medal", (s) => s.workouts >= 50),
  B("first_record", "Personal best", "Set your first personal record", "trophy", (s) => s.records >= 1),
  B("records_10", "Record breaker", "10 personal records", "trophy", (s) => s.records >= 10),
  B("hydrated_7", "Well watered", "Hit your water goal on 7 days", "droplet", (s) => s.waterGoalDays >= 7),
  B("first_measurements", "Measured up", "Recorded your body measurements", "ruler", (s) => s.measurements >= 1),
  B("goal_25", "A quarter of the way", "25% of the way to your target weight", "target", (s) => (s.goalProgress ?? 0) >= 0.25),
  B("goal_50", "Halfway there", "50% of the way to your target weight", "target", (s) => (s.goalProgress ?? 0) >= 0.5),
  B("goal_75", "Nearly there", "75% of the way to your target weight", "target", (s) => (s.goalProgress ?? 0) >= 0.75),
  B("goal_reached", "Goal reached!", "You reached your target weight", "medal", (s) => (s.goalProgress ?? 0) >= 1),
];

export const BADGES: Badge[] = RULES.map((r) => r.badge);
export const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

export function earnedBadges(stats: BadgeStats): string[] {
  return RULES.filter((r) => r.earned(stats)).map((r) => r.badge.key);
}
