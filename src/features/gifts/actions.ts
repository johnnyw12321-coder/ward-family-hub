"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { parseMoney } from "@/lib/money";
import { fetchLinkPreview } from "./link-fetch";
import { claimSchema, claimUpdateSchema, listKey, wishSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

/**
 * Add or edit an item. Whose list it goes on decides what it is: on your own
 * list it's something you'd like; on another member's list it's a surprise
 * idea they can't see; on a family profile's list (a child's) it's shared.
 * The database enforces the same rules.
 *
 * A new or changed link is previewed: its title fills an empty "what is it"
 * and its TT$ price an empty price.
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

  let existing: { link_url: string | null } | null = null;
  if (v.id) {
    const { data } = await ctx.supabase
      .from("wish_items")
      .select("link_url")
      .eq("household_id", ctx.household.id)
      .eq("id", v.id)
      .maybeSingle();
    if (!data) return fail("That idea no longer exists.");
    existing = data;
  }
  const link = empty(v.link);
  const linkChanged = link !== (existing?.link_url ?? null);
  const preview = link && linkChanged ? await fetchLinkPreview(link) : null;
  const title = v.title || preview?.title || "";
  if (!title) return fail("That link didn't give a name, so say what it is.", { title: "Say what it is" });

  const row: Record<string, unknown> = {
    title: title.slice(0, 120),
    details: empty(v.details),
    link_url: link,
    store: empty(v.store),
    price_minor: v.price ? parseMoney(v.price) : (preview?.priceMinor ?? null),
    priority: v.priority,
  };
  if (linkChanged) {
    row.link_title = preview?.title ?? null;
    row.link_site = preview?.site ?? null;
    row.link_checked_at = link ? new Date().toISOString() : null;
  }
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
  const id = res.data[0].id as string;

  refresh();
  return ok({ id }, v.id ? "Saved" : link && !preview ? "Added (that shop doesn't share a preview)" : "Added");
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

/**
 * Fill in link previews for a list's items that don't have one yet, so items
 * added before previews existed catch up. Runs when someone opens a list,
 * owner or not: the preview fields are saved through a function that can set
 * nothing else. `retry` re-checks specific items whose shop failed before.
 */
export async function fillLinkPreviews(listKeyValue: string, retry: string[] = []): Promise<ActionResult<{ updated: number }>> {
  if (!listKey.safeParse(listKeyValue).success || retry.some((id) => !uuid.safeParse(id).success)) return fail("Invalid list.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const [kind, target] = [listKeyValue[0], listKeyValue.slice(2)];
  let q = ctx.supabase
    .from("wish_items")
    .select("id, link_url")
    .eq("household_id", ctx.household.id)
    .not("link_url", "is", null)
    .is("removed_at", null)
    .eq(kind === "m" ? "owner_user_id" : "family_member_id", target);
  q = retry.length ? q.in("id", retry) : q.is("link_checked_at", null);
  const { data, error } = await q.limit(6);
  if (error) {
    logServerError("fillLinkPreviews", error);
    return fail("Couldn't check links.");
  }
  let updated = 0;
  await Promise.all(
    (data ?? []).map(async (item) => {
      const preview = await fetchLinkPreview(item.link_url as string);
      const { error: rpcError } = await ctx.supabase.rpc("save_wish_link_preview", {
        p_household_id: ctx.household.id,
        p_item_id: item.id,
        p_link_url: item.link_url,
        p_title: preview?.title ?? null,
        p_site: preview?.site ?? null,
        p_image_path: null,
      });
      if (rpcError) {
        logServerError("fillLinkPreviews.save", rpcError);
        return;
      }
      if (preview) updated += 1;
    }),
  );
  return ok({ updated });
}
