import type { z } from "zod";

/** Result shape returned by every Server Action. */
export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}

/** Flatten zod issues into { field: firstMessage } for forms. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/**
 * Translate a database error into a message that is safe and useful to show.
 * Our own RAISE EXCEPTION messages (invalid input, integrity rules) are written
 * for users and passed through; everything else becomes a generic message so
 * internals never leak to the client.
 */
export function dbErrorMessage(error: DbError | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "22023": // invalid_parameter_value (our validation)
    case "P0002": // no_data_found (our not-found)
    case "23514": // check_violation (our integrity rules use this too)
      return friendlyCheck(error.message) ?? fallback;
    case "42501":
      return "You don't have permission to do that.";
    case "23505":
      return "That already exists.";
    case "23503":
      return "This item is linked to other records, so it can't be removed. Archive it instead.";
    case "PGRST116":
      return "That record could not be found.";
    default:
      return fallback;
  }
}

function friendlyCheck(message: string | undefined): string | null {
  if (!message) return null;
  // Raw constraint-violation text from Postgres is not user friendly.
  if (/violates check constraint/i.test(message)) return "Some of the values entered are not valid.";
  return message;
}

/** Log a server-side failure without request payloads (which may hold private data). */
export function logServerError(scope: string, error: DbError | Error | unknown): void {
  const e = error as DbError & { name?: string };
  console.error(`[${scope}]`, { code: e?.code, name: e?.name, message: e?.message });
}
