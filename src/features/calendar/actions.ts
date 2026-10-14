"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { isCalendarDate, localToInstant } from "@/lib/dates";
import { parsePreset } from "@/lib/recurrence";
import { eventSchema } from "./schemas";

const uuid = z.uuid();

export async function saveEvent(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const tz = ctx.household.timezone;
  const schedule = v.schedule ? parsePreset(v.schedule) : null;
  const memberIds = new Set(ctx.members.map((m) => m.user_id));
  const participants = [...new Set(v.participants)].filter((id) => memberIds.has(id));

  const row = {
    title: v.title,
    category: v.category,
    all_day: v.allDay,
    starts_at: localToInstant(v.startDate, v.allDay ? "00:00" : v.startTime!, tz),
    ends_at: localToInstant(v.endDate, v.allDay ? "00:00" : v.endTime!, tz),
    location: v.location || null,
    description: v.description || null,
    recurrence_frequency: schedule?.frequency ?? null,
    recurrence_interval: schedule?.interval ?? 1,
    recurrence_until: schedule && v.until ? v.until : null,
    reminder_minutes: [...new Set(v.reminders)].sort((a, b) => a - b),
  };

  const res = v.id
    ? await ctx.supabase.from("calendar_events").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id")
    : await ctx.supabase.from("calendar_events").insert({ ...row, household_id: ctx.household.id }).select("id");
  if (res.error) {
    logServerError("saveEvent", res.error);
    return fail(dbErrorMessage(res.error));
  }
  if (!res.data?.length) return fail("That event no longer exists.");
  const id = res.data[0].id as string;

  // Replace participants (empty = the whole household).
  const del = await ctx.supabase.from("event_participants").delete().eq("household_id", ctx.household.id).eq("event_id", id);
  if (del.error) {
    logServerError("saveEvent.participants", del.error);
    return fail("The event was saved, but who's involved couldn't be updated. Please try again.");
  }
  if (participants.length) {
    const ins = await ctx.supabase
      .from("event_participants")
      .insert(participants.map((user_id) => ({ household_id: ctx.household.id, event_id: id, user_id })));
    if (ins.error) {
      logServerError("saveEvent.participants", ins.error);
      return fail("The event was saved, but who's involved couldn't be updated. Please try again.");
    }
  }
  refresh();
  return ok({ id }, v.id ? "Event updated" : "Event added");
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid event.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.from("calendar_events").delete().eq("household_id", ctx.household.id).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) logServerError("deleteEvent", error);
    return fail(dbErrorMessage(error, "Could not delete the event."));
  }
  refresh();
  return ok(null, "Event deleted");
}

/** Mark an event (or one occurrence of a recurring event) done or not done. */
export async function setEventCompleted(id: string, occurrenceDate: string, completed: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !isCalendarDate(occurrenceDate)) return fail("Invalid event.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data: event } = await ctx.supabase
    .from("calendar_events")
    .select("recurrence_frequency")
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (!event) return fail("That event no longer exists.");

  let error;
  if (event.recurrence_frequency) {
    ({ error } = completed
      ? await ctx.supabase
          .from("event_completions")
          .upsert({ household_id: ctx.household.id, event_id: id, occurrence_date: occurrenceDate }, { onConflict: "event_id,occurrence_date" })
      : await ctx.supabase.from("event_completions").delete().eq("household_id", ctx.household.id).eq("event_id", id).eq("occurrence_date", occurrenceDate));
  } else {
    ({ error } = await ctx.supabase.from("calendar_events").update({ is_completed: completed }).eq("household_id", ctx.household.id).eq("id", id));
  }
  if (error) {
    logServerError("setEventCompleted", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, completed ? "Marked as done" : "Marked as not done");
}
