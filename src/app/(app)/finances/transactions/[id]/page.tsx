import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { LinkedDocuments } from "@/features/documents/components/linked-documents";
import { deleteTransaction } from "@/features/finance/actions";
import { EditTransaction } from "@/features/finance/components/edit-transaction";
import { getAccounts, getCategories, getGroupTransactions, getTransaction } from "@/features/finance/queries";
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/features/finance/types";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { formatInstant, instantToCalendarDate, instantToLocalTime } from "@/lib/dates";
import { minorToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Transaction" };

const uuidRe = /^[0-9a-f-]{36}$/i;

export default function TransactionPage({ params }: PageProps<"/finances/transactions/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <TransactionDetail params={params} />
    </Suspense>
  );
}

async function TransactionDetail({ params }: { params: PageProps<"/finances/transactions/[id]">["params"] }) {
  const { id } = await params;
  if (!uuidRe.test(id)) notFound();
  const ctx = await requireHousehold();
  const tx = await getTransaction(ctx, id);
  if (!tx) notFound();
  const [accounts, categories, group] = await Promise.all([
    getAccounts(ctx, { includeArchived: true }),
    getCategories(ctx, { includeArchived: true }),
    tx.group_id ? getGroupTransactions(ctx, tx.group_id) : Promise.resolve([]),
  ]);
  const tz = ctx.household.timezone;
  const editable = ctx.canWrite && (tx.kind === "expense" || tx.kind === "income" || tx.kind === "transfer");
  const others = group.filter((g) => g.id !== tx.id);

  const details: [string, React.ReactNode][] = [
    ["Type", KIND_LABELS[tx.kind]],
    ["When", formatInstant(tx.occurred_at, tz)],
    ["Category", tx.category_parent_name ? `${tx.category_parent_name} › ${tx.category_name}` : tx.category_name],
    [tx.kind === "transfer" ? "From" : "Account", tx.account_name],
    ["To", tx.to_account_name],
    ["Merchant", tx.merchant],
    ["Payment method", tx.payment_method ? PAYMENT_METHOD_LABELS[tx.payment_method] : null],
    ["Person", memberName(ctx.members, tx.person_user_id)],
    ["Notes", tx.notes],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={tx.description} back={{ href: "/finances/transactions", label: "Transactions" }} />

      <section className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
        <div className="text-3xl font-semibold tracking-tight">
          <Money minor={tx.kind === "transfer" ? tx.amount_minor : tx.signed_amount_minor} tone={tx.kind === "transfer" ? "plain" : "signed"} currency={tx.currency} />
        </div>
        <dl className="mt-4 divide-y text-sm">
          {details
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium break-words whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Added by {memberName(ctx.members, tx.created_by) ?? "someone"} on {formatInstant(tx.created_at, tz)}
          {tx.updated_at !== tx.created_at ? ` · last changed by ${memberName(ctx.members, tx.updated_by) ?? "someone"} on ${formatInstant(tx.updated_at, tz)}` : ""}
        </p>
        {tx.recurring_id ? (
          <p className="mt-1 text-xs">
            <Link href={`/finances/bills/${tx.recurring_id}`} className="text-primary hover:underline">
              Recorded from a recurring item
            </Link>
          </p>
        ) : null}
      </section>

      {others.length ? (
        <section className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-border/80">
          <h2 className="mb-2 font-semibold">Recorded together</h2>
          <ul className="space-y-1">
            {others.map((o) => (
              <li key={o.id} className="flex justify-between">
                <Link href={`/finances/transactions/${o.id}`} className="text-primary hover:underline">
                  {o.description}
                </Link>
                <Money minor={o.amount_minor} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tx.kind === "expense" || tx.kind === "income" ? (
        <LinkedDocuments
          ctx={ctx}
          filter={{ transactionId: tx.id }}
          title="Receipts"
          attachHref={`/documents/new?transaction=${tx.id}&category=receipts&name=${encodeURIComponent(`Receipt — ${tx.description}`.slice(0, 160))}`}
          attachLabel="Attach receipt"
        />
      ) : null}

      {editable ? (
        <EditTransaction
          accounts={accounts.filter((a) => !a.is_archived || a.id === tx.account_id || a.id === tx.to_account_id).map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency }))}
          categories={categories}
          members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
          meId={ctx.userId}
          currency={tx.currency}
          initial={{
            id: tx.id,
            kind: tx.kind as "expense" | "income" | "transfer",
            amount: minorToInput(tx.amount_minor, tx.currency),
            description: tx.description,
            accountId: tx.account_id ?? "",
            toAccountId: tx.to_account_id ?? "",
            categoryId: tx.category_id ?? "",
            date: instantToCalendarDate(tx.occurred_at, tz),
            time: instantToLocalTime(tx.occurred_at, tz),
            paymentMethod: tx.payment_method ?? "",
            personUserId: tx.person_user_id ?? "",
            merchant: tx.merchant ?? "",
            notes: tx.notes ?? "",
            isRefund: tx.kind === "expense" && tx.signed_amount_minor > 0,
          }}
        />
      ) : null}

      {ctx.canWrite ? (
        <ConfirmAction
          action={deleteTransaction.bind(null, tx.id)}
          trigger={
            <>
              <Trash2Icon data-icon="inline-start" /> Delete transaction
            </>
          }
          title="Delete this transaction?"
          description={
            others.length
              ? "This also deletes the linked entry recorded with it. Account balances and reports update immediately. The change is kept in the audit log."
              : "Account balances and reports update immediately. The change is kept in the audit log."
          }
          confirmLabel="Delete"
          redirectTo="/finances/transactions"
          variant="destructive"
          className="w-full"
        />
      ) : null}
    </div>
  );
}
