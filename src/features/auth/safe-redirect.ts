/** Only allow same-origin relative paths as post-login destinations. */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}
