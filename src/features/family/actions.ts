"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { contactSchema, familyDateSchema, healthSchema, memberSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

function done<T>(error: { code?: string; message?: string } | null, scope: string, message: string, data: T): ActionResult<T> {
  if (error) {
    logServerError(scope, error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(data, message);
}

export async function saveFamilyMember(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = memberSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const row = {
    full_name: v.fullName,
    preferred_name: empty(v.preferredName),
    relationship: v.relationship,
    date_of_birth: empty(v.dateOfBirth),
    school_or_care: empty(v.schoolOrCare),
    school_details: empty(v.schoolDetails),
    notes: empty(v.notes),
    colour: v.colour,
    user_id: empty(v.userId),
  };
  const res = v.id
    ? await ctx.supabase.from("family_members").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id")
    : await ctx.supabase.from("family_members").insert({ ...row, household_id: ctx.household.id }).select("id");
  if (res.error) {
    if (res.error.code === "23505") return fail("That account is already linked to another profile.", { userId: "Already linked" });
    logServerError("saveFamilyMember", res.error);
    return fail(dbErrorMessage(res.error));
  }
  if (!res.data?.length) return fail("That profile no longer exists.");
  refresh();
  return ok({ id: res.data[0].id as string }, v.id ? "Profile updated" : "Profile added");
}

export async function setFamilyMemberArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid profile.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("family_members").update({ is_archived: archived }).eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "archiveFamilyMember", archived ? "Archived" : "Restored", null);
}

export async function deleteFamilyMember(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid profile.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("family_members").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteFamilyMember", "Profile deleted", null);
}

/** Health details require a two-factor-verified session (enforced by RLS too). */
export async function saveFamilyHealth(raw: unknown): Promise<ActionResult> {
  const parsed = healthSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  if (ctx.aal !== "aal2") return fail("Verify with two-factor first to change health details.");
  const v = parsed.data;
  const { error } = await ctx.supabase.from("family_health").upsert(
    {
      household_id: ctx.household.id,
      family_member_id: v.familyMemberId,
      blood_type: empty(v.bloodType),
      allergies: empty(v.allergies),
      conditions: empty(v.conditions),
      medications: empty(v.medications),
      doctor: empty(v.doctor),
      health_insurance: empty(v.healthInsurance),
      notes: empty(v.notes),
    },
    { onConflict: "family_member_id" },
  );
  return done(error, "saveFamilyHealth", "Health details saved", null);
}

export async function saveContact(raw: unknown): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const row = {
    family_member_id: empty(v.familyMemberId),
    name: v.name,
    relationship: empty(v.relationship),
    phone: empty(v.phone),
    email: empty(v.email),
    is_emergency: v.isEmergency,
    notes: empty(v.notes),
  };
  const { error } = v.id
    ? await ctx.supabase.from("family_contacts").update(row).eq("household_id", ctx.household.id).eq("id", v.id)
    : await ctx.supabase.from("family_contacts").insert({ ...row, household_id: ctx.household.id });
  return done(error, "saveContact", v.id ? "Contact updated" : "Contact added", null);
}

export async function deleteContact(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid contact.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("family_contacts").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteContact", "Contact removed", null);
}

export async function saveFamilyDate(raw: unknown): Promise<ActionResult> {
  const parsed = familyDateSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const row = { family_member_id: v.familyMemberId, kind: v.kind, title: v.title, on_date: v.onDate, is_annual: v.kind === "important_date" && v.isAnnual, notes: empty(v.notes) };
  const { error } = v.id
    ? await ctx.supabase.from("family_dates").update(row).eq("household_id", ctx.household.id).eq("id", v.id)
    : await ctx.supabase.from("family_dates").insert({ ...row, household_id: ctx.household.id });
  return done(error, "saveFamilyDate", v.kind === "milestone" ? "Milestone saved" : "Date saved", null);
}

export async function deleteFamilyDate(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid entry.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("family_dates").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteFamilyDate", "Removed", null);
}
