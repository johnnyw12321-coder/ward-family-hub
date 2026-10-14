import type { AccountType } from "@/lib/finance/calculations";
import type { CalendarDate } from "@/lib/dates";
import type { Minor } from "@/lib/money";

export type TransactionKind = "expense" | "income" | "transfer" | "opening_balance" | "adjustment";
export type CategoryKind = "expense" | "income";
export type PaymentMethod =
  | "cash"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "cheque"
  | "mobile_wallet"
  | "direct_debit"
  | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  debit_card: "Debit card (Linx)",
  credit_card: "Credit card",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  mobile_wallet: "Mobile wallet",
  direct_debit: "Direct debit",
  other: "Other",
};

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  opening_balance: "Opening balance",
  adjustment: "Adjustment",
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  last4: string | null;
  owner_scope: "shared" | "personal";
  owner_user_id: string | null;
  credit_limit_minor: Minor | null;
  interest_rate_apr: string | null;
  minimum_payment_minor: Minor | null;
  payment_due_day: number | null;
  include_in_net_worth: boolean;
  is_archived: boolean;
  sort_order: number;
  notes: string | null;
};

export type AccountWithBalance = Account & {
  balance_minor: Minor;
  cleared_balance_minor: Minor;
  reconciled_balance_minor: Minor;
  entry_count: number;
};

export type Category = {
  id: string;
  parent_id: string | null;
  kind: CategoryKind;
  name: string;
  icon: string | null;
  color: string | null;
  system_key: string | null;
  is_archived: boolean;
  sort_order: number;
};

export type TransactionRow = {
  id: string;
  kind: TransactionKind;
  occurred_at: string;
  occurred_on: CalendarDate;
  currency: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  category_id: string | null;
  category_name: string | null;
  category_parent_id: string | null;
  category_parent_name: string | null;
  payment_method: PaymentMethod | null;
  person_user_id: string | null;
  group_id: string | null;
  recurring_id: string | null;
  account_id: string | null;
  account_name: string | null;
  to_account_id: string | null;
  to_account_name: string | null;
  amount_minor: Minor;
  signed_amount_minor: Minor;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringItem = {
  id: string;
  direction: "bill" | "income";
  name: string;
  bill_type: string;
  amount_minor: Minor;
  is_variable_amount: boolean;
  currency: string;
  frequency: "weekly" | "monthly" | "yearly";
  interval_count: number;
  anchor_date: CalendarDate;
  next_due_date: CalendarDate;
  end_date: CalendarDate | null;
  account_id: string | null;
  category_id: string | null;
  liability_account_id: string | null;
  payee: string | null;
  person_user_id: string | null;
  autopay: boolean;
  reminder_days_before: number;
  is_active: boolean;
  notes: string | null;
};

export type RecurringPayment = {
  id: string;
  recurring_id: string;
  due_date: CalendarDate;
  status: "paid" | "skipped";
  paid_on: CalendarDate | null;
  amount_minor: Minor | null;
  transaction_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type BudgetProgressRow = {
  allocation_id: string | null;
  category_id: string | null;
  category_name: string;
  parent_id: string | null;
  allocated_minor: Minor;
  carried_in_minor: Minor;
  spent_minor: Minor;
  carry_forward: boolean;
};

export type SummaryRow = {
  income_minor: Minor;
  expense_minor: Minor;
  interest_minor: Minor;
  savings_transfer_minor: Minor;
  debt_principal_minor: Minor;
  transaction_count: number;
};

export type MonthlyRow = { month: CalendarDate; income_minor: Minor; expense_minor: Minor };
export type CategoryTotalRow = { category_id: string; category_name: string; total_minor: Minor; transaction_count: number };
export type AccountHistoryRow = { month: CalendarDate; assets_minor: Minor; liabilities_minor: Minor };

export const BILL_TYPE_LABELS: Record<string, string> = {
  mortgage: "Mortgage",
  rent: "Rent",
  car_loan: "Car loan",
  loan: "Loan",
  utility: "Utility",
  insurance: "Insurance",
  daycare: "Daycare",
  school: "School",
  subscription: "Subscription",
  credit_card: "Credit card",
  salary: "Salary",
  business: "Business",
  other: "Other",
};

export const BILL_TYPES_FOR_BILLS = [
  "mortgage", "rent", "car_loan", "loan", "utility", "insurance", "daycare", "school", "subscription", "credit_card", "other",
] as const;
export const BILL_TYPES_FOR_INCOME = ["salary", "business", "other"] as const;
