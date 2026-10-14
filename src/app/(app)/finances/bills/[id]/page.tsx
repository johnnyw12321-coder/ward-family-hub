import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PauseIcon, PlayIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { cn } from "cn";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { deleteRecurring, setRecurringActive, undoRecurringPayment } from "@/features/finance/actions";
import { dueLabel, dueState } from "@/features/finance/bills";
import { EditRecurringButton, SettleButtons } from "@/features/finance/components/recurring-forms";
import { getAccounts, getCategories, getRecurringItem, getRecurringPayments } from "@/features/finance/queries";
import { BILL_TYPE_LABELS } from "@/features/finance/types";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { minorToInput } from "@/lib/money";
import { describeRecurrence, occurrencesBetween, presetValue } from "@/lib/recurrence";

export const metadata: Metadata = { title: "Bill" };

export default function BillPage({ params }: PageProps<"/finances/bills/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <BillDetail params={params} />
    </Suspense>
  );
}

async function BillDetail({ params }: { params: PageProps<"/finances/bills/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const item = await getRecurringItem(ctx, id);
  if (!item) notFound();
  const [payments, accounts, categories] = await Promise.all([
    getRecurringPayments(ctx, id),
    getAccounts(ctx, { includeArchived: true }),
    getCategories(ctx, { includeArchived: true }),
  ]);
  const income = item.direction === "income";
  const state = dueState(item.next_due_date, ctx.today, item.reminder_days_before);
  const account = accounts.find((a) => a.id === item.account_id);
  const liability = accounts.find((a) => a.id === item.liability_account_id);
  const category = categories.find((c) => c.id === item.category_id);
  const upcoming = occurrencesBetween(item.anchor_date, item.frequency, item.interval_count, item.next_due_date, "2100-01-01", item.end_date, 4);
  const latestPaymentId = payments[0]?.id;
  const activeAccounts = accounts.filter((a) => !a.is_archived).map((a) => ({ id: a.id, name: a.name, type: a.type }));

  const facts: [string, React.ReactNode][] = [
    ["Type", BILL_TYPE_LABELS[item.bill_type] ?? item.bill_type],
    ["Schedule", describeRecurrence(item.frequency, item.interval_count)],
    [income ? "Paid into" : "Paid from", account?.name],
    ["Pays down", liability?.name],
    ["Category", category?.name],
    [income ? "Payer" : "Payee", item.payee],
    ["Responsible", memberName(ctx.members, item.person_user_id) ?? "Shared"],
    ["Reminder", item.reminder_days_before ? `${item.reminder_days_before} days before` : "On the day"],
    ["Ends", item.end_date ? formatDate(item.end_date) : null],
    ["Notes", item.notes],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={item.name}
        back={{ href: "/finances/bills", label: "Bills & income" }}
        actions={
          <>
            {item.autopay ? <Badge variant="secondary">Autopay</Badge> : null}
            {!item.is_active ? <Badge variant="outline">Paused</Badge> : null}
          </>
        }
      />

      <section className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
        <div className="text-sm text-muted-foreground">
          {item.is_variable_amount ? "Usually about" : income ? "Expected" : "Amount"}
        </div>
        <div className="text-3xl font-semibold tracking-tight">
          <Money minor={item.amount_minor} tone={income ? "income" : "plain"} />
        </div>
        {item.is_active ? (
          <div
            className={cn(
              "mt-2 text-sm font-medium",
              state === "overdue" && !income ? "text-destructive" : state === "upcoming" ? "text-muted-foreground" : "text-warning",
            )}
          >
            {dueLabel(item.next_due_date, ctx.today)} · {formatDate(item.next_due_date)}
          </div>
        ) : null}
        {item.autopay && state === "overdue" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Set to autopay, but not confirmed yet. Check your bank, then mark it paid.
          </p>
        ) : null}
      </section>

      {ctx.canWrite && item.is_active ? (
        <SettleButtons
          recurringId={item.id}
          dueDate={item.next_due_date}
          amount={minorToInput(item.amount_minor)}
          accountId={item.account_id ?? ""}
          accounts={activeAccounts}
          today={ctx.today}
          currency={item.currency}
          canRecord={Boolean(item.category_id || item.liability_account_id)}
          direction={item.direction}
        />
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
        {item.is_active && upcoming.length ? (
          <p className="mt-3 text-xs text-muted-foreground">Coming up: {upcoming.map(formatDate).join(", ")}</p>
        ) : null}
      </section>

      <section>
        <SectionHeading title="History" />
        {payments.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {p.status === "paid" ? (income ? "Received" : "Paid") : "Skipped"} · due {formatDate(p.due_date)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.paid_on ? `${formatDate(p.paid_on)} · ` : ""}
                    by {memberName(ctx.members, p.created_by) ?? "someone"}
                    {p.transaction_id ? (
                      <>
                        {" · "}
                        <Link href={`/finances/transactions/${p.transaction_id}`} className="text-primary">
                          transaction
                        </Link>
                      </>
                    ) : p.status === "paid" ? " · not in ledger" : ""}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </div>
                </div>
                {p.amount_minor !== null ? <Money minor={p.amount_minor} className="font-medium" /> : null}
                {ctx.canWrite && p.id === latestPaymentId ? (
                  <ConfirmAction
                    action={undoRecurringPayment.bind(null, p.id)}
                    trigger={<Undo2Icon aria-label="Undo" />}
                    size="icon"
                    variant="ghost"
                    title="Undo this entry?"
                    description={
                      p.transaction_id
                        ? "The payment record and its ledger transaction are removed, and the due date moves back."
                        : "The record is removed and the due date moves back."
                    }
                    confirmLabel="Undo"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
            No payments recorded yet.
          </p>
        )}
      </section>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <EditRecurringButton
            direction={item.direction}
            accounts={activeAccounts}
            categories={categories}
            members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
            currency={item.currency}
            today={ctx.today}
            initial={{
              id: item.id,
              direction: item.direction,
              name: item.name,
              billType: item.bill_type,
              amount: minorToInput(item.amount_minor),
              isVariableAmount: item.is_variable_amount,
              schedule: presetValue(item.frequency, item.interval_count),
              firstDueDate: item.next_due_date,
              endDate: item.end_date ?? "",
              accountId: item.account_id ?? "",
              categoryId: item.category_id ?? "",
              liabilityAccountId: item.liability_account_id ?? "",
              payee: item.payee ?? "",
              personUserId: item.person_user_id ?? "",
              autopay: item.autopay,
              reminderDaysBefore: String(item.reminder_days_before),
              notes: item.notes ?? "",
            }}
          />
          <ConfirmAction
            action={setRecurringActive.bind(null, item.id, !item.is_active)}
            trigger={
              item.is_active ? (
                <>
                  <PauseIcon data-icon="inline-start" /> Pause
                </>
              ) : (
                <>
                  <PlayIcon data-icon="inline-start" /> Resume
                </>
              )
            }
            title={item.is_active ? "Pause this item?" : "Resume this item?"}
            description={item.is_active ? "It stops appearing in upcoming bills and reminders. History is kept." : "It will appear in upcoming bills again."}
            confirmLabel={item.is_active ? "Pause" : "Resume"}
            destructive={false}
          />
          <ConfirmAction
            action={deleteRecurring.bind(null, item.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete this recurring item?"
            description="Its payment history is deleted too. Transactions already recorded in the ledger stay. Pausing is usually better."
            confirmLabel="Delete"
            redirectTo="/finances/bills"
            variant="destructive"
          />
        </div>
      ) : null}
    </div>
  );
}
