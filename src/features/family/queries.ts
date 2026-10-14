import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import { diffDays, type CalendarDate } from "@/lib/dates";

export type FamilyMember = {
  id: string;
  user_id: string | null;
  full_name: string;
  preferred_name: string | null;
  relationship: string;
  date_of_birth: CalendarDate | null;
  school_or_care: string | null;
  school_details: string | null;
  notes: string | null;
  colour: string;
  is_archived: boolean;
};
export type FamilyHealth = {
  blood_type: string | null;
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  doctor: string | null;
  health_insurance: string | null;
  notes: string | null;
  updated_at: string;
};
export type FamilyContact = { id: string; family_member_id: string | null; name: string; relationship: string | null; phone: string | null; email: string | null; is_emergency: boolean; notes: string | null };
export type FamilyDate = { id: string; family_member_id: string | null; kind: "milestone" | "important_date"; title: string; on_date: CalendarDate; is_annual: boolean; notes: string | null };

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

const MEMBER_COLUMNS = "id, user_id, full_name, preferred_name, relationship, date_of_birth, school_or_care, school_details, notes, colour, is_archived";

export async function getFamilyMembers(ctx: HouseholdContext, options: { includeArchived?: boolean } = {}): Promise<FamilyMember[]> {
  let q = ctx.supabase.from("family_members").select(MEMBER_COLUMNS).eq("household_id", ctx.household.id).order("is_archived").order("date_of_birth", { nullsFirst: false });
  if (!options.includeArchived) q = q.eq("is_archived", false);
  const { data, error } = await q;
  if (error) fail("family", error);
  return data as FamilyMember[];
}

export async function getFamilyMember(ctx: HouseholdContext, id: string): Promise<FamilyMember | null> {
  const { data, error } = await ctx.supabase.from("family_members").select(MEMBER_COLUMNS).eq("household_id", ctx.household.id).eq("id", id).maybeSingle();
  if (error) fail("family member", error);
  return (data as FamilyMember) ?? null;
}

/** Health details; RLS returns nothing unless the session is two-factor verified. */
export async function getFamilyHealth(ctx: HouseholdContext, memberId: string): Promise<FamilyHealth | null> {
  if (ctx.aal !== "aal2") return null;
  const { data, error } = await ctx.supabase
    .from("family_health")
    .select("blood_type, allergies, conditions, medications, doctor, health_insurance, notes, updated_at")
    .eq("household_id", ctx.household.id)
    .eq("family_member_id", memberId)
    .maybeSingle();
  if (error) fail("health", error);
  return (data as FamilyHealth) ?? null;
}

export async function getFamilyContacts(ctx: HouseholdContext, memberId?: string | null): Promise<FamilyContact[]> {
  let q = ctx.supabase
    .from("family_contacts")
    .select("id, family_member_id, name, relationship, phone, email, is_emergency, notes")
    .eq("household_id", ctx.household.id)
    .order("is_emergency", { ascending: false })
    .order("name");
  q = memberId === null ? q.is("family_member_id", null) : memberId ? q.eq("family_member_id", memberId) : q;
  const { data, error } = await q;
  if (error) fail("contacts", error);
  return data as FamilyContact[];
}

export async function getFamilyDates(ctx: HouseholdContext, memberId?: string): Promise<FamilyDate[]> {
  let q = ctx.supabase
    .from("family_dates")
    .select("id, family_member_id, kind, title, on_date, is_annual, notes")
    .eq("household_id", ctx.household.id)
    .order("on_date", { ascending: false });
  if (memberId) q = q.eq("family_member_id", memberId);
  const { data, error } = await q;
  if (error) fail("family dates", error);
  return data as FamilyDate[];
}

/** Age in whole years (and months for under-twos) on a given date. */
export function ageOn(dateOfBirth: CalendarDate, today: CalendarDate): string {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) return "Not born yet";
  if (months < 24) return months === 1 ? "1 month" : `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

export function daysUntilBirthday(dateOfBirth: CalendarDate, today: CalendarDate): number {
  const year = Number(today.slice(0, 4));
  const md = dateOfBirth.slice(5);
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const fix = (y: number) => (md === "02-29" && !leap(y) ? `${y}-02-28` : `${y}-${md}`);
  let next = fix(year);
  if (next < today) next = fix(year + 1);
  return diffDays(next, today);
}
