import "server-only";
import { getAccounts, getRecurringItems } from "@/features/finance/queries";
import { getGoals } from "@/features/goals/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import type { DocumentFormOptions } from "./components/document-form";
import { getDocumentCategories } from "./queries";

export async function getDocumentFormOptions(ctx: HouseholdContext): Promise<DocumentFormOptions> {
  const [categories, accounts, bills, goals] = await Promise.all([getDocumentCategories(ctx), getAccounts(ctx), getRecurringItems(ctx), getGoals(ctx)]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, sensitive_default: c.sensitive_default })),
    members: ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    bills: bills.map((b) => ({ id: b.id, name: b.name })),
    goals: goals.filter((g) => g.status !== "cancelled").map((g) => ({ id: g.id, name: g.name })),
  };
}
