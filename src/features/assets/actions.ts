"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { localToInstant } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { assetSchema, contractorSchema, itemSchema, recordSchema, valuationSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);
const money = (v: string | undefined | null) => (v ? parseMoney(v) : null);
const int = (v: string | undefined | null) => (v ? Number(v) : null);

function done<T>(error: { code?: string; message?: string } | null, scope: string, message: string, data: T): ActionResult<T> {
  if (error) {
    logServerError(scope, error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(data, message);
}

export async function saveAsset(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = assetSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const vehicle = v.type === "vehicle";
  const property = v.type === "property";
  const row = {
    type: v.type,
    name: v.name,
    purchase_date: empty(v.purchaseDate),
    purchase_price_minor: money(v.purchasePrice),
    loan_account_id: empty(v.loanAccountId),
    include_in_net_worth: v.includeInNetWorth,
    notes: empty(v.notes),
    address: property ? empty(v.address) : null,
    property_kind: property ? empty(v.propertyKind) : null,
    make: vehicle ? empty(v.make) : null,
    model: vehicle ? empty(v.model) : null,
    model_year: vehicle ? int(v.modelYear) : null,
    registration_plate: vehicle ? empty(v.registrationPlate?.toUpperCase()) : null,
    vin: vehicle ? empty(v.vin?.toUpperCase()) : null,
    colour: vehicle ? empty(v.colour) : null,
    mileage_unit: v.mileageUnit,
    current_mileage: vehicle ? int(v.currentMileage) : null,
    insurance_renewal_date: vehicle ? empty(v.insuranceRenewalDate) : null,
    registration_renewal_date: vehicle ? empty(v.registrationRenewalDate) : null,
    next_service_date: vehicle ? empty(v.nextServiceDate) : null,
    next_service_mileage: vehicle ? int(v.nextServiceMileage) : null,
  };

  if (v.id) {
    const { data: before } = await ctx.supabase.from("assets").select("current_mileage").eq("household_id", ctx.household.id).eq("id", v.id).maybeSingle();
    const mileageChanged = before && before.current_mileage !== row.current_mileage;
    const { data, error } = await ctx.supabase
      .from("assets")
      .update({ ...row, ...(mileageChanged ? { mileage_as_of: ctx.today } : {}) })
      .eq("household_id", ctx.household.id)
      .eq("id", v.id)
      .select("id");
    if (error) {
      logServerError("updateAsset", error);
      return fail(dbErrorMessage(error));
    }
    if (!data?.length) return fail("That item no longer exists.");
    refresh();
    return ok({ id: v.id }, "Saved");
  }

  const { data, error } = await ctx.supabase
    .from("assets")
    .insert({ ...row, household_id: ctx.household.id, mileage_as_of: row.current_mileage !== null ? ctx.today : null })
    .select("id")
    .single();
  if (error) {
    logServerError("createAsset", error);
    return fail(dbErrorMessage(error));
  }
  const value = money(v.estimatedValue);
  if (value !== null) {
    const { error: valueError } = await ctx.supabase
      .from("asset_values")
      .insert({ household_id: ctx.household.id, asset_id: data.id, valued_on: ctx.today, value_minor: value, note: "Initial estimate" });
    if (valueError) logServerError("createAsset.value", valueError);
  }
  refresh();
  return ok({ id: data.id as string }, vehicle ? "Vehicle added" : property ? "Property added" : "Added");
}

export async function setAssetArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("assets").update({ is_archived: archived }).eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "archiveAsset", archived ? "Archived — history kept" : "Restored", null);
}

export async function deleteAsset(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("assets").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteAsset", "Deleted. Linked transactions and documents were kept.", null);
}

export async function addValuation(raw: unknown): Promise<ActionResult> {
  const parsed = valuationSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the valuation.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const { error } = await ctx.supabase.from("asset_values").upsert(
    { household_id: ctx.household.id, asset_id: v.assetId, valued_on: v.valuedOn, value_minor: parseMoney(v.value) ?? 0, note: empty(v.note) },
    { onConflict: "asset_id,valued_on" },
  );
  return done(error, "addValuation", "Value updated", null);
}

export async function deleteValuation(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid valuation.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("asset_values").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteValuation", "Valuation removed", null);
}

/**
 * Save a maintenance/repair record. With recordExpense, the cost is also
 * posted to the ledger as an expense linked to the asset (once — editing a
 * record never creates a second transaction).
 */
export async function saveRecord(raw: unknown): Promise<ActionResult> {
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const cost = money(v.cost);

  let transactionId: string | null = null;
  if (!v.id && v.recordExpense && cost) {
    const { data, error } = await ctx.supabase.rpc("save_transaction", {
      p_household_id: ctx.household.id,
      p_kind: "expense",
      p_amount_minor: cost,
      p_account_id: v.accountId,
      p_category_id: v.categoryId,
      p_occurred_at: localToInstant(v.performedOn, "12:00", ctx.household.timezone),
      p_description: v.title,
      p_person_user_id: ctx.userId,
      p_asset_id: v.assetId,
    });
    if (error) {
      logServerError("saveRecord.expense", error);
      return fail(dbErrorMessage(error));
    }
    transactionId = data as string;
  }

  const row = {
    kind: v.kind,
    title: v.title,
    performed_on: v.performedOn,
    cost_minor: cost,
    contractor_id: empty(v.contractorId),
    mileage: int(v.mileage),
    next_due_date: empty(v.nextDueDate),
    notes: empty(v.notes),
  };
  const { error } = v.id
    ? await ctx.supabase.from("asset_records").update(row).eq("household_id", ctx.household.id).eq("id", v.id)
    : await ctx.supabase.from("asset_records").insert({ ...row, household_id: ctx.household.id, asset_id: v.assetId, transaction_id: transactionId });
  if (error) {
    logServerError("saveRecord", error);
    if (transactionId) await ctx.supabase.from("transactions").delete().eq("household_id", ctx.household.id).eq("id", transactionId);
    return fail(dbErrorMessage(error));
  }

  // Keep the vehicle's odometer current when a record carries a higher reading.
  if (row.mileage !== null) {
    const { data: asset } = await ctx.supabase.from("assets").select("current_mileage").eq("household_id", ctx.household.id).eq("id", v.assetId).maybeSingle();
    if (asset && (asset.current_mileage === null || row.mileage > asset.current_mileage)) {
      await ctx.supabase.from("assets").update({ current_mileage: row.mileage, mileage_as_of: v.performedOn }).eq("household_id", ctx.household.id).eq("id", v.assetId);
    }
  }
  refresh();
  return ok(null, v.id ? "Record updated" : transactionId ? "Recorded — expense added to your accounts" : "Recorded");
}

export async function deleteRecord(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid record.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("asset_records").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteRecord", "Record deleted. Any linked expense stays in your transactions.", null);
}

export async function saveItem(raw: unknown): Promise<ActionResult> {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const row = {
    name: v.name,
    brand: empty(v.brand),
    model: empty(v.model),
    serial_number: empty(v.serialNumber),
    purchase_date: empty(v.purchaseDate),
    price_minor: money(v.price),
    warranty_expires_on: empty(v.warrantyExpiresOn),
    notes: empty(v.notes),
  };
  const { error } = v.id
    ? await ctx.supabase.from("asset_items").update(row).eq("household_id", ctx.household.id).eq("id", v.id)
    : await ctx.supabase.from("asset_items").insert({ ...row, household_id: ctx.household.id, asset_id: v.assetId });
  return done(error, "saveItem", v.id ? "Item updated" : "Item added", null);
}

export async function deleteItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("asset_items").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteItem", "Item removed", null);
}

export async function saveContractor(raw: unknown): Promise<ActionResult> {
  const parsed = contractorSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const row = { name: v.name, trade: empty(v.trade), phone: empty(v.phone), email: empty(v.email), rating: v.rating ? Number(v.rating) : null, notes: empty(v.notes) };
  const { error } = v.id
    ? await ctx.supabase.from("contractors").update(row).eq("household_id", ctx.household.id).eq("id", v.id)
    : await ctx.supabase.from("contractors").insert({ ...row, household_id: ctx.household.id });
  return done(error, "saveContractor", v.id ? "Contractor updated" : "Contractor added", null);
}

export async function deleteContractor(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid contractor.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("contractors").delete().eq("household_id", ctx.household.id).eq("id", id);
  return done(error, "deleteContractor", "Contractor removed", null);
}
