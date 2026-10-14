import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";

export type ShoppingList = { id: string; name: string; is_template: boolean; is_archived: boolean; updated_at: string };
export type ShoppingItem = {
  id: string;
  list_id: string;
  name: string;
  quantity: string | null;
  estimated_price_minor: number | null;
  is_checked: boolean;
  checked_by: string | null;
  created_at: string;
};

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

export async function getShoppingLists(ctx: HouseholdContext): Promise<ShoppingList[]> {
  const { data, error } = await ctx.supabase
    .from("shopping_lists")
    .select("id, name, is_template, is_archived, updated_at")
    .eq("household_id", ctx.household.id)
    .order("is_archived")
    .order("is_template")
    .order("updated_at", { ascending: false });
  if (error) fail("shopping lists", error);
  return data as ShoppingList[];
}

export async function getShoppingList(ctx: HouseholdContext, id: string): Promise<ShoppingList | null> {
  const { data, error } = await ctx.supabase
    .from("shopping_lists")
    .select("id, name, is_template, is_archived, updated_at")
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("shopping list", error);
  return (data as ShoppingList) ?? null;
}

export async function getShoppingItems(ctx: HouseholdContext, listIds: string[]): Promise<ShoppingItem[]> {
  if (!listIds.length) return [];
  const { data, error } = await ctx.supabase
    .from("shopping_items")
    .select("id, list_id, name, quantity, estimated_price_minor, is_checked, checked_by, created_at")
    .eq("household_id", ctx.household.id)
    .in("list_id", listIds)
    .order("is_checked")
    .order("sort_order")
    .order("created_at");
  if (error) fail("shopping items", error);
  return data.map((i) => ({ ...(i as ShoppingItem), estimated_price_minor: i.estimated_price_minor === null ? null : Number(i.estimated_price_minor) }));
}
