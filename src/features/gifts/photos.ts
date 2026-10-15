import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";

/**
 * Photos people take of wishlist items. They live in the private "wishlist"
 * bucket at {household}/{item}/{file}; storage RLS follows the item's own
 * visibility, so a surprise's photo is hidden from its recipient too.
 */
export const WISHLIST_BUCKET = "wishlist";
/** Matches the bucket limit. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

/** Identify a photo by its first bytes; anything else (SVG, HTML, GIF…) is refused. */
export function sniffPhoto(bytes: Uint8Array): PhotoType | null {
  if (bytes.length < 12) return null;
  const ascii = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return null;
}

export async function removePhoto(ctx: HouseholdContext, path: string | null | undefined) {
  if (!path) return;
  const { error } = await ctx.supabase.storage.from(WISHLIST_BUCKET).remove([path]);
  if (error) console.warn("[wishlist:remove]", { message: error.message });
}

/** Short-lived links for the photos the viewer is allowed to see. */
export async function signedPhotoUrls(ctx: HouseholdContext, paths: string[]): Promise<Map<string, string>> {
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
