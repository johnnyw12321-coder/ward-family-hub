import "server-only";
import { randomUUID } from "node:crypto";
import type { HouseholdContext } from "@/lib/auth/context";
import { safeFetch } from "@/lib/safe-fetch";
import { parsePreview, sniffImage, type LinkPreview } from "./link-preview";

export const WISHLIST_BUCKET = "wishlist";
/** Matches the bucket limit. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Read a shop page's preview details. Best effort: any failure means "no preview". */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await safeFetch(url, { maxBytes: 1_200_000, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" });
    if (res.status < 200 || res.status >= 300 || !/html/i.test(res.contentType)) return null;
    return parsePreview(res.body.toString("utf8"), res.url);
  } catch (e) {
    console.warn("[linkPreview]", { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Copy a preview picture into the item's storage folder; returns its path, or null. */
export async function storePreviewImage(ctx: HouseholdContext, itemId: string, imageUrl: string): Promise<string | null> {
  try {
    const res = await safeFetch(imageUrl, { maxBytes: MAX_IMAGE_BYTES + 1, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8" });
    if (res.status < 200 || res.status >= 300 || res.body.length === 0 || res.body.length > MAX_IMAGE_BYTES) return null;
    const type = sniffImage(new Uint8Array(res.body.subarray(0, 32)));
    if (!type) return null;
    const path = `${ctx.household.id}/${itemId}/${randomUUID()}`;
    const { error } = await ctx.supabase.storage.from(WISHLIST_BUCKET).upload(path, res.body, { contentType: type, upsert: false });
    if (error) {
      console.warn("[linkPreview:store]", { message: error.message });
      return null;
    }
    return path;
  } catch (e) {
    console.warn("[linkPreview:image]", { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function removeImage(ctx: HouseholdContext, path: string | null | undefined) {
  if (!path) return;
  const { error } = await ctx.supabase.storage.from(WISHLIST_BUCKET).remove([path]);
  if (error) console.warn("[wishlist:remove]", { message: error.message });
}

/** Short-lived links for the pictures the viewer is allowed to see. */
export async function signedImageUrls(ctx: HouseholdContext, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await ctx.supabase.storage.from(WISHLIST_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) {
    console.warn("[wishlist:sign]", { message: error.message });
    return out;
  }
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}
