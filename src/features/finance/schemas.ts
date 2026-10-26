/**
 * Validation schemas shared by client forms (React Hook Form) and Server
 * Actions. The server always re-validates; client validation is for UX only.
 * Money stays a string here and is converted with parseMoney on the server.
 */
import { z } from "zod";
import { ACCOUNT_TYPES } from "@/lib/finance/calculations";
import { isCalendarDate } from "@/lib/dates";
import { parseMoney } from "@/lib/money";

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const calendarDate = z.string().refine(isCalendarDate, "Enter a valid date");
const optionalCalendarDate = z.union([calendarDate, z.literal("")]).optional();
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).optional();

export const positiveMoney = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  .refine((v) => {
    const m = parseMoney(v);
    return m !== null && m > 0;
  }, "Enter an amount greater than zero, e.g. 125.50");

export const nonNegativeMoney = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    const m = parseMoney(v);
    return m !== null && m >= 0;
  }, "Enter a valid amount, e.g. 125.50");

export const signedMoney = z
  .string()
  .trim()
  .refine((v) => v === "" || parseMoney(v) !== null, "Enter a valid amount, e.g. -125.50");

export const PAYMENT_METHODS = [
  "cash", "debit_card", "credit_card", "bank_transfer", "cheque", "mobile_wallet", "direct_debit", "other",
] as const;

export const transactionSchema = z
  .object({
    id: optionalUuid,
    kind: z.enum(["expense", "income", "transfer"]),
    amount: positiveMoney,
    description: z.string().trim().min(1, "Add a short description").max(200),
    accountId: z.uuid("Choose an account"),
    toAccountId: optionalUuid,
    categoryId: optionalUuid,
    date: calendarDate,
    time: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid time"),
    paymentMethod: z.union([z.enum(PAYMENT_METHODS), z.literal("")]).optional(),
    personUserId: optionalUuid,
    merchant: optionalText(120),
    notes: optionalText(2000),
    isRefund: z.boolean().optional(),
    assetId: optionalUuid,
    familyMemberId: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "transfer") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose the destination account" });
      else if (v.toAccountId === v.accountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose a different account" });
    } else if (!v.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    }
  });
export type TransactionInput = z.infer<typeof transactionSchema>;

export const accountSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(1, "Name the account").max(80),
    type: z.enum(ACCOUNT_TYPES),
    institution: optionalText(80),
    last4: z.union([z.string().regex(/^\d{4}$/, "Use the last 4 digits only"), z.literal("")]).optional(),
    ownerScope: z.enum(["shared", "personal"]),
    ownerUserId: optionalUuid,
    openingBalance: signedMoney.optional(),
    openingDate: optionalCalendarDate,
    creditLimit: nonNegativeMoney.optional(),
    interestRate: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d{1,2}(\.\d{1,4})?$/.test(v) && Number(v) < 100), "Enter a rate like 7.25")
      .optional(),
    minimumPayment: nonNegativeMoney.optional(),
    paymentDueDay: z
      .string()
      .refine((v) => v === "" || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 31), "Day 1–31")
      .optional(),
    includeInNetWorth: z.boolean(),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.ownerScope === "personal" && !v.ownerUserId)
      ctx.addIssue({ code: "custom", path: ["ownerUserId"], message: "Choose whose account this is" });
  });
export type AccountInput = z.infer<typeof accountSchema>;

export const reconcileSchema = z.object({
  accountId: z.uuid(),
  statementBalance: z.string().trim().min(1, "Enter the statement balance").refine((v) => parseMoney(v) !== null, "Enter a valid amount"),
  statementDate: calendarDate,
  /** For liabilities the user enters the amount owed; we flip the sign on the server. */
  enteredAsOwed: z.boolean(),
});
export type ReconcileInput = z.infer<typeof reconcileSchema>;

export const debtPaymentSchema = z
  .object({
    fromAccountId: z.uuid("Choose the account you paid from"),
    debtAccountId: z.uuid("Choose the debt"),
    principal: nonNegativeMoney,
    interest: nonNegativeMoney,
    date: calendarDate,
    description: z.string().trim().min(1).max(160),
  })
  .superRefine((v, ctx) => {
    const p = parseMoney(v.principal || "0") ?? 0;
    const i = parseMoney(v.interest || "0") ?? 0;
    if (p + i <= 0) ctx.addIssue({ code: "custom", path: ["principal"], message: "Enter the principal and/or interest paid" });
  });
export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;

export const categorySchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Name the category").max(60),
  kind: z.enum(["expense", "income"]),
  parentId: optionalUuid,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const recurringSchema = z.object({
  id: optionalUuid,
  direction: z.enum(["bill", "income"]),
  name: z.string().trim().min(1, "Name this item").max(80),
  billType: z.string().min(1),
  amount: nonNegativeMoney.refine((v) => v !== "", "Enter the usual amount"),
  isVariableAmount: z.boolean(),
  schedule: z.string().regex(/^(weekly|monthly|yearly)-\d{1,2}$/, "Choose how often"),
  firstDueDate: calendarDate,
  endDate: optionalCalendarDate,
  accountId: optionalUuid,
  categoryId: optionalUuid,
  liabilityAccountId: optionalUuid,
  payee: optionalText(120),
  personUserId: optionalUuid,
  autopay: z.boolean(),
  reminderDaysBefore: z.string().refine((v) => /^\d{1,2}$/.test(v) && Number(v) <= 60, "0–60 days"),
  notes: optionalText(2000),
});
export type RecurringInput = z.infer<typeof recurringSchema>;

export const settleSchema = z.object({
  recurringId: z.uuid(),
  dueDate: calendarDate,
  status: z.enum(["paid", "skipped"]),
  paidOn: optionalCalendarDate,
  amount: nonNegativeMoney.optional(),
  accountId: optionalUuid,
  recordTransaction: z.boolean(),
  notes: optionalText(500),
});
export type SettleInput = z.infer<typeof settleSchema>;

export const allocationSchema = z.object({
  month: calendarDate.refine((d) => d.endsWith("-01"), "Use the first day of the month"),
  categoryId: z.uuid("Choose a category"),
  amount: nonNegativeMoney.refine((v) => v !== "", "Enter an amount"),
  /** What the amount is per: "month" is a plain monthly budget; the rest are rates. */
  ratePeriod: z.enum(["month", "week", "weekday", "day"]),
  /** A rate line for only the rest of the month: the day it starts (in the month). */
  startsOn: calendarDate.nullable(),
  carryForward: z.boolean(),
}).refine((v) => !v.startsOn || v.startsOn.slice(0, 7) === v.month.slice(0, 7), { path: ["startsOn"], message: "The start day must be in this month" });
export type AllocationInput = z.infer<typeof allocationSchema>;

export const transactionFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  kind: z.enum(["expense", "income", "transfer", "other"]).optional().catch(undefined),
  account: z.uuid().optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  person: z.uuid().optional().catch(undefined),
  asset: z.uuid().optional().catch(undefined),
  member: z.uuid().optional().catch(undefined),
  from: calendarDate.optional().catch(undefined),
  to: calendarDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
