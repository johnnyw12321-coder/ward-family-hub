"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { MEMBER_COLORS } from "@/components/shared/member-color";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name").max(60),
  color: z.enum(MEMBER_COLORS),
});

export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  // Editing your own profile is allowed even for read-only members.
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const [member, profile] = await Promise.all([
    ctx.supabase
      .from("household_members")
      .update({ display_name: parsed.data.displayName, color: parsed.data.color })
      .eq("household_id", ctx.household.id)
      .eq("user_id", ctx.userId),
    ctx.supabase.from("profiles").update({ display_name: parsed.data.displayName }).eq("id", ctx.userId),
  ]);
  const error = member.error ?? profile.error;
  if (error) {
    logServerError("updateProfile", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Profile updated");
}

const householdSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone"),
});

export async function updateHousehold(raw: unknown): Promise<ActionResult> {
  const parsed = householdSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("households")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone })
    .eq("id", ctx.household.id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("updateHousehold", error);
    return fail(dbErrorMessage(error, "Could not update the household."));
  }
  refresh();
  return ok(null, "Household updated");
}
