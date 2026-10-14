import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { todayIn, type CalendarDate } from "@/lib/dates";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";

/**
 * Data Access Layer entry point.
 *
 * Every page and Server Action resolves the caller through here. Identity comes
 * from a verified JWT (getClaims), household membership from the database. The
 * returned Supabase client runs as the user, so RLS still applies to every
 * query — this context is for UX and early errors, not the security boundary.
 */

export type HouseholdRole = "owner" | "adult" | "viewer";

export type Member = {
  user_id: string;
  display_name: string;
  role: HouseholdRole;
  color: string;
};

export type Household = {
  id: string;
  name: string;
  base_currency: string;
  timezone: string;
  locale: string;
};

export type HouseholdContext = {
  supabase: ServerSupabase;
  userId: string;
  email: string | null;
  aal: "aal1" | "aal2";
  household: Household;
  members: Member[];
  me: Member;
  canWrite: boolean;
  today: CalendarDate;
};

type ResolveResult =
  | { status: "ok"; context: HouseholdContext }
  | { status: "signed-out" }
  | { status: "no-household" };

const resolve = cache(async (): Promise<ResolveResult> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "signed-out" };

  const { data: householdId } = await supabase.rpc("current_household_id");
  if (!householdId) return { status: "no-household" };

  const [householdRes, membersRes] = await Promise.all([
    supabase.from("households").select("id, name, base_currency, timezone, locale").eq("id", householdId).single(),
    supabase
      .from("household_members")
      .select("user_id, display_name, role, color")
      .eq("household_id", householdId)
      .order("created_at"),
  ]);
  if (householdRes.error || !householdRes.data || membersRes.error) return { status: "no-household" };

  const members = (membersRes.data ?? []) as Member[];
  const me = members.find((m) => m.user_id === claims.sub);
  if (!me) return { status: "no-household" };
  const household = householdRes.data as Household;

  return {
    status: "ok",
    context: {
      supabase,
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      aal: claims.aal === "aal2" ? "aal2" : "aal1",
      household,
      members,
      me,
      canWrite: me.role === "owner" || me.role === "adult",
      today: todayIn(household.timezone),
    },
  };
});

/** For pages: redirects when signed out or not provisioned. */
export async function requireHousehold(): Promise<HouseholdContext> {
  const result = await resolve();
  if (result.status === "signed-out") redirect("/login");
  if (result.status === "no-household") redirect("/no-access");
  return result.context;
}

/** For Server Actions and Route Handlers: never redirects, reports why instead. */
export async function getActionContext(
  options: { write?: boolean } = { write: true },
): Promise<{ ok: true; ctx: HouseholdContext } | { ok: false; error: string }> {
  const result = await resolve();
  if (result.status === "signed-out") return { ok: false, error: "Your session has ended. Please sign in again." };
  if (result.status === "no-household") return { ok: false, error: "Your account is not linked to a household." };
  if (options.write !== false && !result.context.canWrite) {
    return { ok: false, error: "Your account has read-only access." };
  }
  return { ok: true, ctx: result.context };
}

export function memberName(members: Member[], userId: string | null | undefined): string | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId)?.display_name ?? null;
}
