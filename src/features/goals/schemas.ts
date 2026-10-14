import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";
import { nonNegativeMoney, positiveMoney, signedMoney } from "@/features/finance/schemas";

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const date = z.string().refine(isCalendarDate, "Enter a valid date");
const optionalDate = z.union([date, z.literal("")]).optional();
const decimal = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter a number, e.g. 12 or 2.5");

export const GOAL_CATEGORIES = [
  "savings", "debt", "purchase", "home", "vehicle", "family", "health", "education", "travel", "career", "net_worth", "other",
] as const;
export const GOAL_SOURCES = ["manual", "contributions", "account_balance", "debt_payoff", "milestones"] as const;

export const goalSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(1, "Name the goal").max(120),
    description: z.string().trim().max(2000).optional(),
    category: z.enum(GOAL_CATEGORIES),
    progressSource: z.enum(GOAL_SOURCES),
    measure: z.enum(["money", "number"]),
    targetAmount: nonNegativeMoney.optional(),
    targetValue: decimal.optional(),
    unit: z.string().trim().max(30).optional(),
    linkedAccountId: optionalUuid,
    startDate: date,
    targetDate: optionalDate,
    assignedUserId: optionalUuid,
    priority: z.enum(["low", "medium", "high"]),
    notes: z.string().trim().max(4000).optional(),
  })
  .superRefine((v, ctx) => {
    const needsAccount = v.progressSource === "account_balance" || v.progressSource === "debt_payoff";
    if (needsAccount && !v.linkedAccountId) ctx.addIssue({ code: "custom", path: ["linkedAccountId"], message: "Choose the account to follow" });
    if (v.targetDate && v.targetDate < v.startDate) ctx.addIssue({ code: "custom", path: ["targetDate"], message: "Must be after the start date" });
    if (v.progressSource === "milestones" || v.progressSource === "debt_payoff") return;
    const money = v.progressSource !== "manual" || v.measure === "money";
    if (money && !v.targetAmount) ctx.addIssue({ code: "custom", path: ["targetAmount"], message: "Enter the target amount" });
    if (!money && !v.targetValue) ctx.addIssue({ code: "custom", path: ["targetValue"], message: "Enter the target" });
  });
export type GoalInput = z.infer<typeof goalSchema>;

export const milestoneSchema = z.object({
  goalId: z.uuid(),
  title: z.string().trim().min(1, "Describe the milestone").max(160),
  dueDate: optionalDate,
});
export type MilestoneInput = z.infer<typeof milestoneSchema>;

export const contributionSchema = z.object({
  goalId: z.uuid(),
  amount: signedMoney.refine((v) => v !== "", "Enter an amount"),
  date,
  note: z.string().trim().max(300).optional(),
});
export type ContributionInput = z.infer<typeof contributionSchema>;

export const manualProgressSchema = z.object({
  goalId: z.uuid(),
  amount: nonNegativeMoney.optional(),
  value: decimal.optional(),
});
export type ManualProgressInput = z.infer<typeof manualProgressSchema>;

export { positiveMoney };
