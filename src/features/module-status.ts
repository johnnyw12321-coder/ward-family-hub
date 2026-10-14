/** Which sections are live. Anything not "available" shows a "planned" badge. */
export const MODULE_STATUS: Record<string, "available" | `Phase ${number}`> = {
  "/tasks": "Phase 3",
  "/documents": "Phase 4",
  "/property": "Phase 5",
  "/vehicles": "Phase 5",
  "/family": "Phase 5",
  "/reports": "available",
  "/settings": "available",
};
