/** Colour swatches a household member can pick for their avatar and labels. */
export const MEMBER_COLORS = ["sage", "clay", "slate", "amber", "plum", "teal", "rose", "sky"] as const;

const CLASSES: Record<string, string> = {
  sage: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  clay: "bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100",
  slate: "bg-slate-200 text-slate-900 dark:bg-slate-700/60 dark:text-slate-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  plum: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/50 dark:text-fuchsia-100",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
  sky: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
};

export function memberColorClass(color: string | null | undefined): string {
  return CLASSES[color ?? ""] ?? CLASSES.sage;
}
