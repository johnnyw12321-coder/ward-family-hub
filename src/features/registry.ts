/**
 * Module registry: the single place that says which optional modules are live.
 * Modules add their quick-add entries here when they ship, so the UI never
 * shows a control for something that doesn't work yet.
 */
export const QUICK_ADD_LINKS: { href: string; label: string; icon: "task" | "event" }[] = [];
