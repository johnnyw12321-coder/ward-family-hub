"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { parseMoney } from "@/lib/money";
import { claimSchema, claimUpdateSchema, wishSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

/**
 * Add or edit an item. Whose list it goes on decides what it is: on your own
 * list it's something you'd like; on another member's list it's a surprise
 * idea they can't see; on a family profile's list (a child's) it's shared.
 * The database enforces the same rules.
 */
export async function saveWish(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = wishSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const [kind, target] = [v.list[0], v.list.slice(2)];
  if (kind === "m" && !ctx.members.some((m) => m.user_id === target)) return fail("That person isn't in your household.");

  const row = {
    title: v.title,
    details: empty(v.details),
    link_url: empty(v.link),
    store: empty(v.store),
    price_minor: v.price ? parseMoney(v.price) : null,
    priority: v.priority,
  };
  const res = v.id
    ? await ctx.supabase.from("wish_items").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id")
    : await ctx.supabase
        .from("wish_items")
        .insert({
          ...row,
          household_id: ctx.household.id,
          owner_user_id: kind === "m" ? target : null,
          family_member_id: kind === "f" ? target : null,
          is_surprise: kind === "m" && target !== ctx.userId,
        })
        .select("id");
  if (res.error) {
    logServerError("saveWish", res.error);
    return fail(dbErrorMessage(res.error, "Could not save this idea."));
  }
  if (!res.data?.length) return fail("You can only change ideas you're allowed to edit.");
  refresh();
  return ok({ id: res.data[0].id as string }, v.id ? "Saved" : "Added");
}

async function updateItem(
  id: string,
  patch: (today: string) => Record<string, unknown>,
  scope: string,
  message: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.from("wish_items").update(patch(ctx.today)).eq("household_id", ctx.household.id).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) logServerError(scope, error);
    return fail(dbErrorMessage(error, "You can only change ideas you're allowed to edit."));
  }
  refresh();
  return ok(null, message);
}

/** Removing hides the item from the list but keeps it for anyone who already claimed it. */
export async function removeWish(id: string): Promise<ActionResult> {
  return updateItem(id, () => ({ removed_at: new Date().toISOString() }), "removeWish", "Removed from the list");
}

export async function setWishReceived(id: string, received: boolean): Promise<ActionResult> {
  return updateItem(id, (today) => ({ received_on: received ? today : null }), "setWishReceived", received ? "Marked as received" : "Back on the list");
}

export async function claimWish(raw: unknown): Promise<ActionResult> {
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("wish_claims").insert({
    household_id: ctx.household.id,
    item_id: parsed.data.itemId,
    occasion: parsed.data.occasion,
    note: empty(parsed.data.note),
  });
  if (error) {
    logServerError("claimWish", error);
    return fail(error.code === "23505" ? "You've already claimed this one." : dbErrorMessage(error, "Could not claim this idea."));
  }
  refresh();
  return ok(null, "It's yours to get — they won't see that you picked it");
}

export async function updateClaim(raw: unknown): Promise<ActionResult> {
  const parsed = claimUpdateSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the form.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const patch: Record<string, unknown> = { status: v.status, given_on: v.status === "given" ? ctx.today : null };
  if (v.pricePaid !== undefined) patch.price_paid_minor = v.pricePaid ? parseMoney(v.pricePaid) : null;
  const { data, error } = await ctx.supabase.from("wish_claims").update(patch).eq("household_id", ctx.household.id).eq("id", v.id).select("id");
  if (error || !data?.length) {
    if (error) logServerError("updateClaim", error);
    return fail(dbErrorMessage(error, "Only the person who claimed this can change it."));
  }
  refresh();
  return ok(null, v.status === "given" ? "Marked as given" : v.status === "bought" ? "Marked as bought" : "Updated");
}

export async function releaseClaim(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid claim.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.from("wish_claims").delete().eq("household_id", ctx.household.id).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) logServerError("releaseClaim", error);
    return fail(dbErrorMessage(error, "Only the person who claimed this can drop it."));
  }
  refresh();
  return ok(null, "Back up for grabs");
}
