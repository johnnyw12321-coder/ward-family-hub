/** Which sections are live. Anything not "available" shows a "planned" badge. */
export const MODULE_STATUS: Record<string, "available" | `Phase ${number}`> = {
  "/tasks": "available",
  "/documents": "available",
  "/property": "available",
  "/vehicles": "available",
  "/family": "available",
  "/reports": "available",
  "/settings": "available",
};
