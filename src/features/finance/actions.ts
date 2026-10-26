"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { localToInstant, monthStart, isCalendarDate } from "@/lib/dates";
import { isLiability } from "@/lib/finance/calculations";
import { rateForMonth } from "./until";
import { parseMoney } from "@/lib/money";
import { parsePreset } from "@/lib/recurrence";
import {
  accountSchema,
  allocationSchema,
  categorySchema,
  debtPaymentSchema,
  reconcileSchema,
  recurringSchema,
  settleSchema,
  transactionSchema,
} from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);
const money = (v: string | undefined | null) => (v ? parseMoney(v) : null);

function invalid(error: z.ZodError) {
  return fail("Please check the highlighted fields.", zodFieldErrors(error));
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export async function saveTransaction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;

  const { data, error } = await ctx.supabase.rpc("save_transaction", {
    p_household_id: ctx.household.id,
    p_transaction_id: empty(v.id),
    p_kind: v.kind,
    p_amount_minor: parseMoney(v.amount),
    p_account_id: v.accountId,
    p_to_account_id: v.kind === "transfer" ? empty(v.toAccountId) : null,
    p_category_id: v.kind === "transfer" ? null : empty(v.categoryId),
    p_occurred_at: localToInstant(v.date, v.time, ctx.household.timezone),
    p_description: v.description,
    p_payment_method: v.kind === "expense" ? empty(v.paymentMethod) : null,
    p_person_user_id: empty(v.personUserId),
    p_merchant: v.kind === "transfer" ? null : empty(v.merchant),
    p_notes: empty(v.notes),
    p_is_refund: v.kind === "expense" && Boolean(v.isRefund),
    p_asset_id: v.kind === "transfer" ? null : empty(v.assetId),
    p_family_member_id: v.kind === "transfer" ? null : empty(v.familyMemberId),
  });
  if (error) {
    logServerError("saveTransaction", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok({ id: data as string }, v.id ? "Transaction updated" : "Transaction saved");
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid transaction.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  // Linked halves (e.g. a debt payment's principal and interest) are removed together.
  const { data: tx } = await ctx.supabase
    .from("transactions")
    .select("group_id")
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  let query = ctx.supabase.from("transactions").delete().eq("household_id", ctx.household.id);
  query = tx?.group_id ? query.eq("group_id", tx.group_id) : query.eq("id", id);
  const { data, error } = await query.select("id");
  if (error) {
    logServerError("deleteTransaction", error);
    return fail(dbErrorMessage(error));
  }
  if (!data?.length) return fail("That transaction no longer exists.");
  refresh();
  return ok(null, "Transaction deleted");
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export async function saveAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const liability = isLiability(v.type);

  const common = {
    name: v.name,
    institution: empty(v.institution),
    last4: empty(v.last4),
    owner_scope: v.ownerScope,
    owner_user_id: v.ownerScope === "personal" ? empty(v.ownerUserId) : null,
    credit_limit_minor: v.type === "credit_card" || v.type === "line_of_credit" ? money(v.creditLimit) : null,
    interest_rate_apr: v.interestRate ? v.interestRate : null,
    minimum_payment_minor: liability ? money(v.minimumPayment) : null,
    payment_due_day: liability && v.paymentDueDay ? Number(v.paymentDueDay) : null,
    include_in_net_worth: v.includeInNetWorth,
    notes: empty(v.notes),
  };

  if (v.id) {
    const { data, error } = await ctx.supabase
      .from("financial_accounts")
      .update({ ...common, type: v.type })
      .eq("household_id", ctx.household.id)
      .eq("id", v.id)
      .select("id");
    if (error) {
      logServerError("updateAccount", error);
      return fail(dbErrorMessage(error));
    }
    if (!data?.length) return fail("That account no longer exists.");
    refresh();
    return ok({ id: v.id }, "Account updated");
  }

  // Opening balance: users enter what an account holds, or what they owe on a
  // liability. The ledger stores liabilities as negative balances.
  const opening = money(v.openingBalance) ?? 0;
  const signedOpening = liability ? -Math.abs(opening) : opening;
  const openingDate = v.openingDate && isCalendarDate(v.openingDate) ? v.openingDate : ctx.today;

  const { data, error } = await ctx.supabase.rpc("create_account", {
    p_household_id: ctx.household.id,
    p_name: common.name,
    p_type: v.type,
    p_currency: ctx.household.base_currency,
    p_opening_balance_minor: signedOpening,
    p_opening_date: localToInstant(openingDate, "00:00", ctx.household.timezone),
    p_institution: common.institution,
    p_last4: common.last4,
    p_owner_scope: common.owner_scope,
    p_owner_user_id: common.owner_user_id,
    p_credit_limit_minor: common.credit_limit_minor,
    p_interest_rate_apr: common.interest_rate_apr,
    p_minimum_payment_minor: common.minimum_payment_minor,
    p_payment_due_day: common.payment_due_day,
    p_include_in_net_worth: common.include_in_net_worth,
    p_notes: common.notes,
  });
  if (error) {
    logServerError("createAccount", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok({ id: data as string }, "Account added");
}

export async function setAccountArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid account.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("financial_accounts")
    .update({ is_archived: archived, archived_at: archived ? new Date().toISOString() : null })
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("archiveAccount", error);
    return fail(dbErrorMessage(error, "Could not update the account."));
  }
  refresh();
  return ok(null, archived ? "Account archived" : "Account restored");
}

/** Only accounts with no ledger history can be deleted; others are archived. */
export async function deleteAccount(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid account.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("financial_accounts")
    .delete()
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code !== "23503") logServerError("deleteAccount", error);
    return fail(
      error.code === "23503"
        ? "This account has transactions, so it can't be deleted. Archive it to hide it while keeping its history."
        : dbErrorMessage(error),
    );
  }
  if (!data?.length) return fail("That account no longer exists.");
  refresh();
  return ok(null, "Account deleted");
}

export async function reconcileAccount(raw: unknown): Promise<ActionResult<{ difference: number }>> {
  const parsed = reconcileSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const entered = parseMoney(v.statementBalance) ?? 0;
  const statement = v.enteredAsOwed ? -entered : entered;
  const { data, error } = await ctx.supabase.rpc("reconcile_account", {
    p_household_id: ctx.household.id,
    p_account_id: v.accountId,
    p_statement_balance_minor: statement,
    p_statement_date: localToInstant(v.statementDate, "23:59", ctx.household.timezone),
    p_mark_reconciled: true,
  });
  if (error) {
    logServerError("reconcileAccount", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  const diff = Number(data);
  return ok({ difference: diff }, diff === 0 ? "Balance matches — account reconciled" : "Adjustment posted and account reconciled");
}

export async function recordDebtPayment(raw: unknown): Promise<ActionResult> {
  const parsed = debtPaymentSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const { error } = await ctx.supabase.rpc("record_debt_payment", {
    p_household_id: ctx.household.id,
    p_from_account_id: v.fromAccountId,
    p_debt_account_id: v.debtAccountId,
    p_principal_minor: money(v.principal) ?? 0,
    p_interest_minor: money(v.interest) ?? 0,
    p_occurred_at: localToInstant(v.date, "12:00", ctx.household.timezone),
    p_description: v.description,
    p_person_user_id: ctx.userId,
  });
  if (error) {
    logServerError("recordDebtPayment", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Payment recorded");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function saveCategory(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const row = { name: v.name, parent_id: empty(v.parentId) };
  const res = v.id
    ? await ctx.supabase.from("transaction_categories").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id")
    : await ctx.supabase
        .from("transaction_categories")
        .insert({ ...row, household_id: ctx.household.id, kind: v.kind, sort_order: 100 })
        .select("id");
  if (res.error) {
    if (res.error.code !== "23505") logServerError("saveCategory", res.error);
    return fail(res.error.code === "23505" ? "A category with that name already exists here." : dbErrorMessage(res.error));
  }
  if (!res.data?.length) return fail("That category no longer exists.");
  refresh();
  return ok({ id: res.data[0].id as string }, v.id ? "Category renamed" : "Category added");
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid category.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data: cat } = await ctx.supabase
    .from("transaction_categories")
    .select("system_key")
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  if (archived && cat?.system_key) return fail("This category is used by the app and can't be archived.");
  const { data, error } = await ctx.supabase
    .from("transaction_categories")
    .update({ is_archived: archived })
    .eq("household_id", ctx.household.id)
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("archiveCategory", error);
    return fail(dbErrorMessage(error, "Could not update the category."));
  }
  refresh();
  return ok(null, archived ? "Category archived — past transactions keep it" : "Category restored");
}

// ---------------------------------------------------------------------------
// Recurring bills and income
// ---------------------------------------------------------------------------
export async function saveRecurring(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = recurringSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const schedule = parsePreset(v.schedule);
  if (!schedule) return fail("Choose how often this repeats.", { schedule: "Choose how often" });
  if (v.endDate && v.endDate < v.firstDueDate) return fail("The end date must be after the first due date.", { endDate: "Must be after the first due date" });

  const row = {
    direction: v.direction,
    name: v.name,
    bill_type: v.billType,
    amount_minor: parseMoney(v.amount) ?? 0,
    is_variable_amount: v.isVariableAmount,
    currency: ctx.household.base_currency,
    frequency: schedule.frequency,
    interval_count: schedule.interval,
    end_date: empty(v.endDate),
    account_id: empty(v.accountId),
    category_id: empty(v.categoryId),
    liability_account_id: v.direction === "bill" ? empty(v.liabilityAccountId) : null,
    payee: empty(v.payee),
    person_user_id: empty(v.personUserId),
    autopay: v.autopay,
    reminder_days_before: Number(v.reminderDaysBefore),
    notes: empty(v.notes),
  };

  if (v.id) {
    const { data: existing } = await ctx.supabase
      .from("recurring_items")
      .select("anchor_date, next_due_date, frequency, interval_count")
      .eq("household_id", ctx.household.id)
      .eq("id", v.id)
      .maybeSingle();
    if (!existing) return fail("That item no longer exists.");
    // Changing the schedule re-anchors it at the chosen next due date.
    const scheduleChanged =
      existing.anchor_date !== v.firstDueDate ||
      existing.frequency !== schedule.frequency ||
      existing.interval_count !== schedule.interval;
    const { error } = await ctx.supabase
      .from("recurring_items")
      .update({
        ...row,
        ...(scheduleChanged ? { anchor_date: v.firstDueDate, next_due_date: v.firstDueDate } : {}),
      })
      .eq("household_id", ctx.household.id)
      .eq("id", v.id);
    if (error) {
      logServerError("updateRecurring", error);
      return fail(dbErrorMessage(error));
    }
    refresh();
    return ok({ id: v.id }, "Saved");
  }

  const { data, error } = await ctx.supabase
    .from("recurring_items")
    .insert({ ...row, household_id: ctx.household.id, anchor_date: v.firstDueDate, next_due_date: v.firstDueDate })
    .select("id")
    .single();
  if (error) {
    logServerError("createRecurring", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok({ id: data.id as string }, v.direction === "bill" ? "Bill added" : "Income added");
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("recurring_items")
    .update({ is_active: active })
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("setRecurringActive", error);
    return fail(dbErrorMessage(error, "Could not update this item."));
  }
  refresh();
  return ok(null, active ? "Reactivated" : "Paused — no further reminders");
}

export async function settleRecurring(raw: unknown): Promise<ActionResult> {
  const parsed = settleSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const { error } = await ctx.supabase.rpc("settle_recurring", {
    p_household_id: ctx.household.id,
    p_recurring_id: v.recurringId,
    p_due_date: v.dueDate,
    p_status: v.status,
    p_paid_on: v.status === "paid" ? v.paidOn || ctx.today : null,
    p_amount_minor: v.status === "paid" ? money(v.amount) : null,
    p_record_transaction: v.status === "paid" && v.recordTransaction,
    p_account_id: empty(v.accountId),
    p_notes: empty(v.notes),
  });
  if (error) {
    if (error.code === "23505") return fail("This due date has already been settled.");
    logServerError("settleRecurring", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, v.status === "paid" ? "Marked as paid" : "Skipped this occurrence");
}

/** Undo a settlement: removes the payment record (and its transaction) and restores the due date. */
export async function undoRecurringPayment(paymentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(paymentId).success) return fail("Invalid payment.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.rpc("undo_recurring_payment", {
    p_household_id: ctx.household.id,
    p_payment_id: paymentId,
  });
  if (error) {
    logServerError("undoRecurringPayment", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Payment undone");
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid item.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("recurring_items")
    .delete()
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("deleteRecurring", error);
    return fail(dbErrorMessage(error, "Could not delete this item."));
  }
  refresh();
  return ok(null, "Deleted. Transactions already recorded are kept.");
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export async function saveAllocation(raw: unknown): Promise<ActionResult> {
  const parsed = allocationSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;

  const budget = await ctx.supabase
    .from("budgets")
    .upsert({ household_id: ctx.household.id, month: v.month }, { onConflict: "household_id,month" })
    .select("id")
    .single();
  if (budget.error) {
    logServerError("saveAllocation.budget", budget.error);
    return fail(dbErrorMessage(budget.error));
  }
  const entered = parseMoney(v.amount) ?? 0;
  const rate = v.ratePeriod === "month" ? null : { rate_minor: entered, rate_period: v.ratePeriod };
  // Only a rate can cover part of the month; starting on the 1st is the whole month.
  const startsOn = rate && v.startsOn && v.startsOn !== v.month ? v.startsOn : null;
  const { error } = await ctx.supabase.from("budget_allocations").upsert(
    {
      household_id: ctx.household.id,
      budget_id: budget.data.id,
      category_id: v.categoryId,
      // A rate's monthly amount is worked out for this month's days (from its start day).
      amount_minor: rate ? rateForMonth(entered, v.ratePeriod, v.month, startsOn) : entered,
      rate_minor: rate?.rate_minor ?? null,
      rate_period: rate?.rate_period ?? null,
      starts_on: startsOn,
      carry_forward: v.carryForward,
    },
    { onConflict: "budget_id,category_id" },
  );
  if (error) {
    logServerError("saveAllocation", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Budget updated");
}

export async function deleteAllocation(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid budget line.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from("budget_allocations")
    .delete()
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error) logServerError("deleteAllocation", error);
    return fail(dbErrorMessage(error, "Could not remove this budget line."));
  }
  refresh();
  return ok(null, "Removed from budget");
}

export async function copyBudget(fromMonth: string, toMonth: string): Promise<ActionResult> {
  if (!isCalendarDate(fromMonth) || !isCalendarDate(toMonth)) return fail("Invalid month.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.rpc("copy_budget", {
    p_household_id: ctx.household.id,
    p_from_month: monthStart(fromMonth),
    p_to_month: monthStart(toMonth),
  });
  if (error) {
    logServerError("copyBudget", error);
    return fail(dbErrorMessage(error));
  }
  refresh();
  return ok(null, "Budget copied");
}
