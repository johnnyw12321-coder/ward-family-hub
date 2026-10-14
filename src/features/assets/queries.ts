import "server-only";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";

export type AssetRow = {
  id: string;
  type: "property" | "vehicle" | "other";
  name: string;
  purchase_date: CalendarDate | null;
  purchase_price_minor: number | null;
  currency: string;
  estimated_value_minor: number | null;
  value_as_of: CalendarDate | null;
  include_in_net_worth: boolean;
  loan_account_id: string | null;
  notes: string | null;
  is_archived: boolean;
  address: string | null;
  property_kind: string | null;
  make: string | null;
  model: string | null;
  model_year: number | null;
  registration_plate: string | null;
  vin: string | null;
  colour: string | null;
  mileage_unit: "km" | "mi";
  current_mileage: number | null;
  mileage_as_of: CalendarDate | null;
  insurance_renewal_date: CalendarDate | null;
  registration_renewal_date: CalendarDate | null;
  next_service_date: CalendarDate | null;
  next_service_mileage: number | null;
};

export type AssetRecord = {
  id: string;
  asset_id: string;
  kind: string;
  title: string;
  performed_on: CalendarDate;
  cost_minor: number | null;
  contractor_id: string | null;
  mileage: number | null;
  transaction_id: string | null;
  next_due_date: CalendarDate | null;
  notes: string | null;
  created_by: string | null;
};

export type AssetItem = {
  id: string;
  asset_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: CalendarDate | null;
  price_minor: number | null;
  warranty_expires_on: CalendarDate | null;
  notes: string | null;
};

export type Contractor = { id: string; name: string; trade: string | null; phone: string | null; email: string | null; rating: number | null; notes: string | null };
export type Valuation = { id: string; valued_on: CalendarDate; value_minor: number; note: string | null };

const COLUMNS =
  "id, type, name, purchase_date, purchase_price_minor, currency, estimated_value_minor, value_as_of, include_in_net_worth, loan_account_id, notes, is_archived, address, property_kind, make, model, model_year, registration_plate, vin, colour, mileage_unit, current_mileage, mileage_as_of, insurance_renewal_date, registration_renewal_date, next_service_date, next_service_mileage";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

function normalise(r: Record<string, unknown>): AssetRow {
  return { ...(r as AssetRow), purchase_price_minor: num(r.purchase_price_minor), estimated_value_minor: num(r.estimated_value_minor) };
}

export async function getAssets(ctx: HouseholdContext, type?: AssetRow["type"], options: { includeArchived?: boolean } = {}): Promise<AssetRow[]> {
  let q = ctx.supabase.from("assets").select(COLUMNS).eq("household_id", ctx.household.id).order("is_archived").order("name");
  if (type) q = q.eq("type", type);
  if (!options.includeArchived) q = q.eq("is_archived", false);
  const { data, error } = await q;
  if (error) fail("assets", error);
  return data.map(normalise);
}

export async function getAsset(ctx: HouseholdContext, id: string): Promise<AssetRow | null> {
  const { data, error } = await ctx.supabase.from("assets").select(COLUMNS).eq("household_id", ctx.household.id).eq("id", id).maybeSingle();
  if (error) fail("asset", error);
  return data ? normalise(data) : null;
}

export async function getAssetRecords(ctx: HouseholdContext, assetId: string): Promise<AssetRecord[]> {
  const { data, error } = await ctx.supabase
    .from("asset_records")
    .select("id, asset_id, kind, title, performed_on, cost_minor, contractor_id, mileage, transaction_id, next_due_date, notes, created_by")
    .eq("household_id", ctx.household.id)
    .eq("asset_id", assetId)
    .order("performed_on", { ascending: false });
  if (error) fail("asset records", error);
  return data.map((r) => ({ ...(r as AssetRecord), cost_minor: num(r.cost_minor) }));
}

export async function getAssetItems(ctx: HouseholdContext, assetId?: string): Promise<AssetItem[]> {
  let q = ctx.supabase
    .from("asset_items")
    .select("id, asset_id, name, brand, model, serial_number, purchase_date, price_minor, warranty_expires_on, notes")
    .eq("household_id", ctx.household.id)
    .eq("is_archived", false)
    .order("name");
  if (assetId) q = q.eq("asset_id", assetId);
  const { data, error } = await q;
  if (error) fail("asset items", error);
  return data.map((i) => ({ ...(i as AssetItem), price_minor: num(i.price_minor) }));
}

export async function getValuations(ctx: HouseholdContext, assetId: string): Promise<Valuation[]> {
  const { data, error } = await ctx.supabase
    .from("asset_values")
    .select("id, valued_on, value_minor, note")
    .eq("household_id", ctx.household.id)
    .eq("asset_id", assetId)
    .order("valued_on", { ascending: false });
  if (error) fail("valuations", error);
  return data.map((v) => ({ ...(v as Valuation), value_minor: Number(v.value_minor) }));
}

export async function getContractors(ctx: HouseholdContext): Promise<Contractor[]> {
  const { data, error } = await ctx.supabase
    .from("contractors")
    .select("id, name, trade, phone, email, rating, notes")
    .eq("household_id", ctx.household.id)
    .order("name");
  if (error) fail("contractors", error);
  return data as Contractor[];
}

export async function getAssetCosts(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<Map<string, { ledger: number; logged: number }>> {
  const { data, error } = await ctx.supabase.rpc("report_asset_costs", { p_household_id: ctx.household.id, p_from: from, p_to: to });
  if (error) fail("asset costs", error);
  return new Map((data as Record<string, unknown>[]).map((r) => [r.asset_id as string, { ledger: Number(r.ledger_minor), logged: Number(r.logged_minor) }]));
}

export async function getAssetValueHistory(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<Map<CalendarDate, number>> {
  const { data, error } = await ctx.supabase.rpc("report_asset_values", { p_household_id: ctx.household.id, p_from: from, p_to: to });
  if (error) fail("asset values", error);
  return new Map((data as Record<string, unknown>[]).map((r) => [r.month as CalendarDate, Number(r.value_minor)]));
}

/** Current value of assets that count toward net worth. */
export function assetsNetWorthValue(assets: AssetRow[]): number {
  return assets.filter((a) => a.include_in_net_worth && !a.is_archived).reduce((s, a) => s + (a.estimated_value_minor ?? 0), 0);
}
