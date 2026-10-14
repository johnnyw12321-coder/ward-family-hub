/**
 * Household tables included in exports, in dependency order (parents first) so
 * a restore can insert them in sequence. New modules add their tables here.
 * Sensitive documents are only included when the session is two-factor
 * verified (RLS); the owner-run script (service role) always includes them.
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
  "goals",
  "goal_milestones",
  "goal_contributions",
  "calendar_events",
  "event_participants",
  "event_completions",
  "tasks",
  "task_checklist_items",
  "task_comments",
  "task_completions",
  "shopping_lists",
  "shopping_items",
  "document_categories",
  "documents",
  "document_files",
  "audit_logs",
] as const;
