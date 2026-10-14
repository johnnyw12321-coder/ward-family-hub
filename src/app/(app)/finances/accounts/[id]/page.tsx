import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, ReceiptIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { LinkedDocuments } from "@/features/documents/components/linked-documents";
import { deleteAccount, setAccountArchived } from "@/features/finance/actions";
import { EditAccountButton, ReconcileButton } from "@/features/finance/components/account-dialogs";
import { DebtPaymentButton } from "@/features/finance/components/debt-payment-dialog";
import { TransactionList } from "@/features/finance/components/transaction-list";
import { getAccount, getAccounts, getCategories, getTransactions } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { ACCOUNT_TYPE_LABELS, creditUtilisation, displayBalance, isLiability } from "@/lib/finance/calculations";
import { minorToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage({ params }: PageProps<"/finances/accounts/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={5} />}>
      <AccountDetail params={params} />
    </Suspense>
  );
}

async function AccountDetail({ params }: { params: PageProps<"/finances/accounts/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const account = await getAccount(ctx, id);
  if (!account) notFound();
  const [register, categories, allAccounts] = await Promise.all([
    getTransactions(ctx, { account: id }, { pageSize: 30 }),
    getCategories(ctx, { includeArchived: true }),
    getAccounts(ctx),
  ]);
  const liability = isLiability(account.type);
  const shown = displayBalance(account.type, account.balance_minor);
  const utilisation = creditUtilisation(account.balance_minor, account.credit_limit_minor);
  const members = ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }));
  const pending = account.balance_minor - account.cleared_balance_minor;
  const unreconciled = account.balance_minor - account.reconciled_balance_minor;

  const facts: [string, React.ReactNode][] = [
    ["Type", ACCOUNT_TYPE_LABELS[account.type]],
    ["Bank", account.institution],
    ["Number", account.last4 ? `•••• ${account.last4}` : null],
    ["Owner", account.owner_scope === "shared" ? "Shared" : ctx.members.find((m) => m.user_id === account.owner_user_id)?.display_name],
    ["Credit limit", account.credit_limit_minor !== null ? <Money minor={account.credit_limit_minor} /> : null],
    ["Interest rate", account.interest_rate_apr ? `${Number(account.interest_rate_apr)}%` : null],
    ["Monthly payment", account.minimum_payment_minor !== null ? <Money minor={account.minimum_payment_minor} /> : null],
    ["Due day", account.payment_due_day ? `Day ${account.payment_due_day}` : null],
    ["Net worth", account.include_in_net_worth ? "Included" : "Excluded"],
    ["Notes", account.notes],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={account.name}
        back={{ href: "/finances/accounts", label: "Accounts" }}
        actions={account.is_archived ? <Badge variant="outline">Archived</Badge> : null}
      />

      <section className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
        <div className="text-sm text-muted-foreground">{liability ? (shown >= 0 ? "Currently owed" : "In credit") : "Balance"}</div>
        <div className="text-3xl font-semibold tracking-tight">
          <Money minor={liability ? Math.abs(shown) : shown} currency={account.currency} />
        </div>
        {utilisation !== null ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{utilisation}% of limit used</span>
              {account.credit_limit_minor ? (
                <span>
                  <Money minor={Math.max(0, account.credit_limit_minor + account.balance_minor)} /> available
                </span>
              ) : null}
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={utilisation > 80 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-primary"}
                style={{ width: `${Math.min(100, utilisation)}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {pending !== 0 ? (
            <span>
              Pending: <Money minor={displayBalance(account.type, pending)} />
            </span>
          ) : null}
          <span>
            {unreconciled === 0 && account.entry_count > 0 ? (
              "Fully reconciled"
            ) : (
              <>
                Not yet reconciled: <Money minor={displayBalance(account.type, unreconciled)} />
              </>
            )}
          </span>
        </div>
      </section>

      {ctx.canWrite ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <EditAccountButton
            members={members}
            currency={account.currency}
            today={ctx.today}
            initial={{
              id: account.id,
              name: account.name,
              type: account.type,
              institution: account.institution ?? "",
              last4: account.last4 ?? "",
              ownerScope: account.owner_scope,
              ownerUserId: account.owner_user_id ?? "",
              creditLimit: minorToInput(account.credit_limit_minor),
              interestRate: account.interest_rate_apr ? String(Number(account.interest_rate_apr)) : "",
              minimumPayment: minorToInput(account.minimum_payment_minor),
              paymentDueDay: account.payment_due_day ? String(account.payment_due_day) : "",
              includeInNetWorth: account.include_in_net_worth,
              notes: account.notes ?? "",
            }}
          />
          <ReconcileButton
            accountId={account.id}
            liability={liability}
            currentMinor={liability ? -account.balance_minor : account.balance_minor}
            currency={account.currency}
            today={ctx.today}
          />
          {liability && !account.is_archived ? (
            <DebtPaymentButton
              debt={{ id: account.id, name: account.name }}
              fromAccounts={allAccounts.filter((a) => !isLiability(a.type)).map((a) => ({ id: a.id, name: a.name }))}
              today={ctx.today}
              currency={account.currency}
              suggestedPayment={account.minimum_payment_minor}
            />
          ) : null}
          <ConfirmAction
            action={setAccountArchived.bind(null, account.id, !account.is_archived)}
            trigger={
              account.is_archived ? (
                <>
                  <ArchiveRestoreIcon data-icon="inline-start" /> Restore
                </>
              ) : (
                <>
                  <ArchiveIcon data-icon="inline-start" /> Archive
                </>
              )
            }
            title={account.is_archived ? "Restore this account?" : "Archive this account?"}
            description={
              account.is_archived
                ? "It will appear in lists and forms again."
                : "It will be hidden from forms and totals of active accounts. Its full history stays in reports."
            }
            confirmLabel={account.is_archived ? "Restore" : "Archive"}
            destructive={false}
          />
          {account.entry_count === 0 ? (
            <ConfirmAction
              action={deleteAccount.bind(null, account.id)}
              trigger={
                <>
                  <Trash2Icon data-icon="inline-start" /> Delete
                </>
              }
              title="Delete this account?"
              description="It has no transactions, so nothing else is affected."
              confirmLabel="Delete"
              redirectTo="/finances/accounts"
              variant="destructive"
            />
          ) : null}
        </div>
      ) : null}

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <dl className="divide-y text-sm">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      <LinkedDocuments
        ctx={ctx}
        filter={{ accountId: account.id }}
        title="Documents"
        attachHref={`/documents/new?account=${account.id}&category=banking&name=${encodeURIComponent(account.name)}`}
        attachLabel="Attach"
      />

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Activity</h2>
          {register.total > register.rows.length ? (
            <Link href={`/finances/transactions?account=${account.id}`} className="text-sm font-medium text-primary">
              All {register.total}
            </Link>
          ) : null}
        </div>
        {register.rows.length ? (
          <TransactionList
            rows={register.rows}
            categories={categories}
            members={ctx.members}
            timezone={ctx.household.timezone}
            perspectiveAccountId={account.id}
          />
        ) : (
          <EmptyState icon={ReceiptIcon} title="No activity yet" description="Transactions using this account will appear here." />
        )}
      </section>
    </div>
  );
}
