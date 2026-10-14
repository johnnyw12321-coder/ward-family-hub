import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClockIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { BillRow } from "@/features/finance/components/bill-row";
import { AddRecurringButton } from "@/features/finance/components/recurring-forms";
import { getAccounts, getCategories, getRecurringItems } from "@/features/finance/queries";
import type { RecurringItem } from "@/features/finance/types";
import { requireHousehold } from "@/lib/auth/context";
import { addDays } from "@/lib/dates";
import { monthlyEquivalent } from "@/lib/finance/calculations";

export const metadata: Metadata = { title: "Bills & income" };

export default function BillsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Bills & income" />
          <ListSkeleton rows={5} />
        </>
      }
    >
      <BillsView />
    </Suspense>
  );
}

function Group({ title, items, today }: { title: string; items: RecurringItem[]; today: string }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeading title={title} />
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
        {items.map((i) => (
          <BillRow key={i.id} item={i} today={today} />
        ))}
      </ul>
    </section>
  );
}

async function BillsView() {
  const ctx = await requireHousehold();
  const [items, accounts, categories] = await Promise.all([
    getRecurringItems(ctx, { includeInactive: true }),
    getAccounts(ctx),
    getCategories(ctx),
  ]);
  const { today } = ctx;
  const active = items.filter((i) => i.is_active);
  const bills = active.filter((i) => i.direction === "bill");
  const income = active.filter((i) => i.direction === "income");
  const overdue = bills.filter((b) => b.next_due_date < today);
  const soon = bills.filter((b) => b.next_due_date >= today && b.next_due_date <= addDays(today, 30));
  const later = bills.filter((b) => b.next_due_date > addDays(today, 30));
  const paused = items.filter((i) => !i.is_active);
  const monthlyBills = bills.reduce((s, b) => s + monthlyEquivalent(b.amount_minor, b.frequency, b.interval_count), 0);
  const monthlyIncome = income.reduce((s, b) => s + monthlyEquivalent(b.amount_minor, b.frequency, b.interval_count), 0);
  const formProps = {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    categories,
    members: ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name })),
    currency: ctx.household.base_currency,
    today,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bills & income"
        description="Nothing is marked paid automatically — confirm each payment so your records stay accurate."
        actions={
          ctx.canWrite ? (
            <>
              <AddRecurringButton direction="income" {...formProps} />
              <AddRecurringButton direction="bill" {...formProps} />
            </>
          ) : null
        }
      />
      {active.length ? (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Bills per month" value={<Money minor={monthlyBills} trimZeroCents />} hint="Average across schedules" />
          <StatCard label="Expected income / month" value={<Money minor={monthlyIncome} trimZeroCents />} />
        </div>
      ) : null}
      <Group title="Overdue" items={overdue} today={today} />
      <Group title="Next 30 days" items={soon} today={today} />
      <Group title="Later" items={later} today={today} />
      <Group title="Recurring income" items={income} today={today} />
      <Group title="Paused" items={paused} today={today} />
      {!items.length ? (
        <EmptyState
          icon={CalendarClockIcon}
          title="No recurring bills yet"
          description="Add the mortgage, car loan, utilities, insurance, daycare and subscriptions so nothing slips by."
        />
      ) : null}
    </div>
  );
}
