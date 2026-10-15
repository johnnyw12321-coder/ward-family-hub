"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { parseMoney } from "@/lib/money";
import { fetchLinkPreview, MAX_IMAGE_BYTES, removeImage, storePreviewImage, WISHLIST_BUCKET } from "./images";
import { sniffImage } from "./link-preview";
import { claimSchema, claimUpdateSchema, wishSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

/**
 * Add or edit an item. Whose list it goes on decides what it is: on your own
 * list it's something you'd like; on another member's list it's a surprise
 * idea they can't see; on a family profile's list (a child's) it's shared.
 * The database enforces the same rules.
 *
 * A new or changed link is previewed: its title fills an empty "what is it",
 * its TT$ price an empty price, and its picture is copied in unless the item
 * already has a photo someone took.
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

  let existing: { link_url: string | null; image_path: string | null; image_source: string | null } | null = null;
  if (v.id) {
    const { data } = await ctx.supabase
      .from("wish_items")
      .select("link_url, image_path, image_source")
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

  // The link's picture, unless someone's photo is already there.
  if (linkChanged && existing?.image_source !== "photo") {
    const path = preview?.imageUrl ? await storePreviewImage(ctx, id, preview.imageUrl) : null;
    if (path || existing?.image_source === "link") {
      await ctx.supabase
        .from("wish_items")
        .update({ image_path: path, image_source: path ? "link" : null })
        .eq("household_id", ctx.household.id)
        .eq("id", id);
      if (existing?.image_source === "link") await removeImage(ctx, existing.image_path);
    }
  }
  refresh();
  return ok({ id }, v.id ? "Saved" : link && !preview ? "Added (that shop doesn't share a preview)" : "Added");
}

// ---------------------------------------------------------------------------
// Photos: signed upload URL → the browser uploads the (already shrunk) photo
// straight to Storage → finishWishPhoto re-reads the bytes on the server and
// keeps it only if it really is a JPEG, PNG or WebP, like the document vault.
// ---------------------------------------------------------------------------
export async function startWishPhoto(itemId: string): Promise<ActionResult<{ fileId: string; path: string; token: string }>> {
  if (!uuid.safeParse(itemId).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const fileId = randomUUID();
  const { data, error } = await ctx.supabase.storage.from(WISHLIST_BUCKET).createSignedUploadUrl(`${ctx.household.id}/${itemId}/${fileId}`);
  if (error || !data) {
    console.error("[wishlist:signedUpload]", { message: error?.message });
    return fail("The photo upload couldn't be started. Please try again.");
  }
  return ok({ fileId, path: data.path, token: data.token });
}

export async function finishWishPhoto(itemId: string, fileId: string): Promise<ActionResult> {
  if (!uuid.safeParse(itemId).success || !uuid.safeParse(fileId).success) return fail("Invalid photo.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const path = `${ctx.household.id}/${itemId}/${fileId}`;
  const storage = ctx.supabase.storage.from(WISHLIST_BUCKET);
  const { data: blob, error } = await storage.download(path);
  if (error || !blob) return fail("The photo didn't arrive. Please try again.");
  const type = sniffImage(new Uint8Array(await blob.slice(0, 32).arrayBuffer()));
  if (blob.size === 0 || blob.size > MAX_IMAGE_BYTES || !type || type === "image/gif") {
    await storage.remove([path]);
    return fail("That doesn't look like a photo, so it wasn't kept.");
  }
  const { data: item } = await ctx.supabase.from("wish_items").select("image_path").eq("household_id", ctx.household.id).eq("id", itemId).maybeSingle();
  const { data: updated, error: updateError } = await ctx.supabase
    .from("wish_items")
    .update({ image_path: path, image_source: "photo" })
    .eq("household_id", ctx.household.id)
    .eq("id", itemId)
    .select("id");
  if (updateError || !updated?.length) {
    if (updateError) logServerError("finishWishPhoto", updateError);
    await storage.remove([path]);
    return fail("You can only add photos to ideas you're allowed to edit.");
  }
  if (item?.image_path && item.image_path !== path) await removeImage(ctx, item.image_path);
  refresh();
  return ok(null, "Photo added");
}

export async function removeWishPhoto(itemId: string): Promise<ActionResult> {
  if (!uuid.safeParse(itemId).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data: item } = await ctx.supabase.from("wish_items").select("image_path").eq("household_id", ctx.household.id).eq("id", itemId).maybeSingle();
  const { data, error } = await ctx.supabase
    .from("wish_items")
    .update({ image_path: null, image_source: null })
    .eq("household_id", ctx.household.id)
    .eq("id", itemId)
    .select("id");
  if (error || !data?.length) return fail(dbErrorMessage(error, "You can only change ideas you're allowed to edit."));
  await removeImage(ctx, item?.image_path);
  refresh();
  return ok(null, "Photo removed");
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
