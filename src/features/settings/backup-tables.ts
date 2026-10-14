/**
 * Household tables included in exports, in dependency order (parents first) so
 * a restore can insert them in sequence. New modules add their tables here.
 */
export const BACKUP_TABLES = [
  "households",
  "household_members",
  "financial_accounts",
  "transaction_categories",
  "recurring_items",
  "transactions",
  "transaction_entries",
  "recurring_payments",
  "budgets",
  "budget_allocations",
  "audit_logs",
] as const;
