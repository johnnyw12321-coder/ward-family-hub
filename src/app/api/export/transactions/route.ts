import { NextResponse, type NextRequest } from "next/server";
import { categoryWithChildren, getAllTransactions, getCategories } from "@/features/finance/queries";
import { transactionFiltersSchema } from "@/features/finance/schemas";
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/features/finance/types";
import { getActionContext } from "@/lib/auth/context";
import { toCsv } from "@/lib/csv";
import { instantToLocalTime } from "@/lib/dates";
import { toDecimalString } from "@/lib/money";

/** CSV export of transactions matching the same filters as the list page. */
export async function GET(request: NextRequest) {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { ctx } = auth;

  const filters = transactionFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const categories = await getCategories(ctx, { includeArchived: true });
  const ids = filters.category ? categoryWithChildren(categories, filters.category) : undefined;
  const rows = await getAllTransactions(ctx, { ...filters, page: undefined }, ids);
  const who = (id: string | null) => ctx.members.find((m) => m.user_id === id)?.display_name ?? "";

  const csv = toCsv(
    ["Date", "Time", "Type", "Description", "Merchant", "Category", "Parent category", "Account", "To account", "Amount", "Signed amount", "Currency", "Payment method", "Person", "Notes", "Transaction ID"],
    rows.map((r) => [
      r.occurred_on,
      instantToLocalTime(r.occurred_at, ctx.household.timezone),
      KIND_LABELS[r.kind],
      r.description,
      r.merchant,
      r.category_name,
      r.category_parent_name,
      r.account_name,
      r.to_account_name,
      toDecimalString(r.amount_minor, r.currency),
      toDecimalString(r.signed_amount_minor, r.currency),
      r.currency,
      r.payment_method ? PAYMENT_METHOD_LABELS[r.payment_method] : "",
      who(r.person_user_id),
      r.notes,
      r.id,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ward-transactions-${ctx.today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
