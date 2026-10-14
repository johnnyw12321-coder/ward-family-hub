/**
 * Colours a household member can pick. The colour tints their avatar and
 * labels, and is also their personal app theme (see globals.css, [data-accent]).
 */
export const MEMBER_COLORS = ["sage", "clay", "slate", "amber", "plum", "teal", "rose", "pink", "sky"] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];

export const MEMBER_COLOR_LABELS: Record<MemberColor, string> = {
  sage: "Sage",
  clay: "Clay",
  slate: "Slate",
  amber: "Amber",
  plum: "Plum",
  teal: "Teal",
  rose: "Rose",
  pink: "Pink",
  sky: "Sky",
};

const CLASSES: Record<string, string> = {
  sage: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  clay: "bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100",
  slate: "bg-slate-200 text-slate-900 dark:bg-slate-700/60 dark:text-slate-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  plum: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/50 dark:text-fuchsia-100",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
  pink: "bg-pink-100 text-pink-900 dark:bg-pink-900/50 dark:text-pink-100",
  sky: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
};

export function memberColorClass(color: string | null | undefined): string {
  return CLASSES[color ?? ""] ?? CLASSES.sage;
}

export function isMemberColor(value: unknown): value is MemberColor {
  return typeof value === "string" && (MEMBER_COLORS as readonly string[]).includes(value);
}

const ACCENT_STORAGE_KEY = "ward-accent";

/**
 * Runs in <head> before first paint so the last theme used on this device
 * shows immediately, without a flash of the default colour. The signed-in
 * member's saved colour then takes over (AccentSync).
 */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});if(${JSON.stringify(
  MEMBER_COLORS,
)}.indexOf(a)>-1)document.documentElement.dataset.accent=a}catch(e){}`;

let savedAccent: MemberColor | undefined;

/** Browser only: switch the app theme, and remember it on this device unless previewing. */
export function applyAccent(color: string, { persist = true }: { persist?: boolean } = {}) {
  if (!isMemberColor(color)) return;
  document.documentElement.dataset.accent = color;
  if (!persist) return;
  savedAccent = color;
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, color);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}

/** Browser only: end a preview and return to the last saved theme. */
export function restoreAccent() {
  if (savedAccent) document.documentElement.dataset.accent = savedAccent;
}
