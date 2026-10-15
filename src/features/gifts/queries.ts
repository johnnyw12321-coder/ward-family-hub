import "server-only";
import { daysUntilBirthday, getFamilyMembers } from "@/features/family/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import { addDays, type CalendarDate } from "@/lib/dates";
import { signedImageUrls } from "./images";
import type { Occasion } from "./schemas";

export type WishItem = {
  id: string;
  owner_user_id: string | null;
  family_member_id: string | null;
  title: string;
  details: string | null;
  link_url: string | null;
  store: string | null;
  price_minor: number | null;
  priority: "love" | "like";
  is_surprise: boolean;
  received_on: CalendarDate | null;
  removed_at: string | null;
  created_by: string | null;
  created_at: string;
  image_path: string | null;
  image_source: "photo" | "link" | null;
  link_title: string | null;
  link_site: string | null;
  link_checked_at: string | null;
  /** Short-lived link to the picture, when there is one the viewer may see. */
  image_url: string | null;
};

export type WishClaim = {
  id: string;
  item_id: string;
  occasion: Occasion;
  status: "planned" | "bought" | "given";
  price_paid_minor: number | null;
  note: string | null;
  given_on: CalendarDate | null;
  created_by: string | null;
};

export type WishList = {
  key: string;
  ownerUserId: string | null;
  familyMemberId: string | null;
  name: string;
  color: string;
  isMine: boolean;
  birthday: { date: CalendarDate; days: number } | null;
};

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

const money = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n)) throw new RangeError("Unsafe money value from database");
  return n;
};

const ITEM_COLUMNS =
  "id, owner_user_id, family_member_id, title, details, link_url, store, price_minor, priority, is_surprise, received_on, removed_at, created_by, created_at, image_path, image_source, link_title, link_site, link_checked_at";

/**
 * Everyone who can have a list: each household member (their own list) and
 * each family profile without an account, such as a child. Birthdays come
 * from family profiles; a member's profile is the one linked to their account.
 */
export async function getWishLists(ctx: HouseholdContext): Promise<WishList[]> {
  const family = await getFamilyMembers(ctx);
  const birthday = (dob: CalendarDate | null) => {
    if (!dob) return null;
    const days = daysUntilBirthday(dob, ctx.today);
    return { date: addDays(ctx.today, days), days };
  };
  const members: WishList[] = ctx.members
    .filter((m) => m.role !== "viewer" || m.user_id === ctx.userId)
    .map((m) => ({
      key: `m-${m.user_id}`,
      ownerUserId: m.user_id,
      familyMemberId: null,
      name: m.display_name,
      color: m.color,
      isMine: m.user_id === ctx.userId,
      birthday: birthday(family.find((f) => f.user_id === m.user_id)?.date_of_birth ?? null),
    }));
  const profiles: WishList[] = family
    .filter((f) => !f.user_id)
    .map((f) => ({
      key: `f-${f.id}`,
      ownerUserId: null,
      familyMemberId: f.id,
      name: f.preferred_name || f.full_name,
      color: f.colour,
      isMine: false,
      birthday: birthday(f.date_of_birth),
    }));
  // Your own list first, then whoever's birthday is next.
  return [...members, ...profiles].sort(
    (a, b) => Number(b.isMine) - Number(a.isMine) || (a.birthday?.days ?? 999) - (b.birthday?.days ?? 999) || a.name.localeCompare(b.name),
  );
}

export function findList(lists: WishList[], key: string): WishList | null {
  return lists.find((l) => l.key === key) ?? null;
}

/** Items (and the claims you're allowed to see) for some or all lists. */
export async function getWishes(ctx: HouseholdContext, list?: WishList): Promise<{ items: WishItem[]; claims: WishClaim[] }> {
  let q = ctx.supabase.from("wish_items").select(ITEM_COLUMNS).eq("household_id", ctx.household.id).order("created_at", { ascending: false });
  if (list?.ownerUserId) q = q.eq("owner_user_id", list.ownerUserId);
  if (list?.familyMemberId) q = q.eq("family_member_id", list.familyMemberId);
  const { data, error } = await q;
  if (error) fail("gift ideas", error);
  const rows = data as Record<string, unknown>[];
  // Pictures are only shown on a list page, not the overview.
  const paths = list ? rows.map((r) => r.image_path as string | null).filter((p): p is string => Boolean(p)) : [];
  const urls = await signedImageUrls(ctx, paths);
  const items = rows.map((r) => ({
    ...(r as WishItem),
    price_minor: money(r.price_minor),
    image_url: r.image_path ? (urls.get(r.image_path as string) ?? null) : null,
  }));
  if (!items.length) return { items, claims: [] };
  const { data: claims, error: claimError } = await ctx.supabase
    .from("wish_claims")
    .select("id, item_id, occasion, status, price_paid_minor, note, given_on, created_by")
    .eq("household_id", ctx.household.id)
    .in(
      "item_id",
      items.map((i) => i.id),
    );
  if (claimError) fail("gift claims", claimError);
  return {
    items,
    claims: (claims as Record<string, unknown>[]).map((c) => ({ ...(c as WishClaim), price_paid_minor: money(c.price_paid_minor) })),
  };
}
