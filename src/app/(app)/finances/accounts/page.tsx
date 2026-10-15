import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { WalletIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { AddAccountButton } from "@/features/finance/components/account-dialogs";
import { AccountGroups } from "@/features/finance/components/account-groups";
import { getAccounts } from "@/features/finance/queries";
import { requireHousehold } from "@/lib/auth/context";
import { summariseBalances } from "@/lib/finance/calculations";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage({ searchParams }: PageProps<"/finances/accounts">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Accounts" />
          <ListSkeleton rows={5} />
        </>
      }
    >
      <AccountsView searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountsView({ searchParams }: { searchParams: PageProps<"/finances/accounts">["searchParams"] }) {
  const showArchived = (await searchParams).archived === "1";
  const ctx = await requireHousehold();
  const accounts = await getAccounts(ctx, { includeArchived: true });
  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);
  const totals = summariseBalances(active);
  const members = ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        description="Balances are calculated from recorded transactions."
        actions={ctx.canWrite ? <AddAccountButton members={members} currency={ctx.household.base_currency} today={ctx.today} /> : null}
      />
      {active.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <StatCard label="Assets" value={<Money minor={totals.totalAssets} trimZeroCents />} />
            <StatCard label="Owed" value={<Money minor={totals.totalLiabilities} trimZeroCents />} />
            <StatCard label="Net" value={<Money minor={totals.netWorth} trimZeroCents />} tone="primary" />
          </div>
          <AccountGroups accounts={active} members={ctx.members} />
        </>
      ) : (
        <EmptyState
          icon={WalletIcon}
          title="Add your first account"
          description="Start with your main chequing account, then savings, cash and any credit cards or loans."
        />
      )}
      {archived.length ? (
        showArchived ? (
          <section>
            <h2 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">Archived</h2>
            <AccountGroups accounts={archived} members={ctx.members} />
            <Link href="/finances/accounts" className="mt-2 inline-block px-1 text-sm text-primary">
              Hide archived accounts
            </Link>
          </section>
        ) : (
          <Link href="/finances/accounts?archived=1" className="inline-block px-1 text-sm text-primary">
            Show {archived.length} archived account{archived.length === 1 ? "" : "s"}
          </Link>
        )
      ) : null}
    </div>
  );
}
