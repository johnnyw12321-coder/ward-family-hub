import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, FilterIcon, ReceiptIcon, SearchIcon, XIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { TransactionList } from "@/features/finance/components/transaction-list";
import { categoryWithChildren, getAccounts, getCategories, getTransactions } from "@/features/finance/queries";
import { transactionFiltersSchema, type TransactionFilters } from "@/features/finance/schemas";
import { getAboutOptions } from "@/features/calendar/about-options";
import { requireHousehold } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Transactions" };

type SearchParams = PageProps<"/finances/transactions">["searchParams"];

export default function TransactionsPage({ searchParams }: PageProps<"/finances/transactions">) {
  return (
    <div>
      <PageHeader title="Transactions" />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <TransactionsView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function toQuery(filters: TransactionFilters, overrides: Partial<Record<keyof TransactionFilters, string | number | undefined>> = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...overrides })) {
    if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function TransactionsView({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = transactionFiltersSchema.parse(flat);
  const ctx = await requireHousehold();
  const [accounts, categories, related] = await Promise.all([
    getAccounts(ctx, { includeArchived: true }),
    getCategories(ctx, { includeArchived: true }),
    getAboutOptions(ctx),
  ]);
  const categoryIds = filters.category ? categoryWithChildren(categories, filters.category) : undefined;
  const result = await getTransactions(ctx, filters, { categoryIds });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageTotal = result.rows.reduce((s, r) => s + (r.kind === "transfer" ? 0 : r.signed_amount_minor), 0);

  const chips: { label: string; key: keyof TransactionFilters }[] = [];
  if (filters.q) chips.push({ label: `“${filters.q}”`, key: "q" });
  if (filters.kind) chips.push({ label: filters.kind === "other" ? "Adjustments" : filters.kind, key: "kind" });
  if (filters.account) chips.push({ label: accounts.find((a) => a.id === filters.account)?.name ?? "Account", key: "account" });
  if (filters.category) chips.push({ label: categories.find((c) => c.id === filters.category)?.name ?? "Category", key: "category" });
  if (filters.person) chips.push({ label: ctx.members.find((m) => m.user_id === filters.person)?.display_name ?? "Person", key: "person" });
  if (filters.asset) chips.push({ label: related.assets.find((a) => a.id === filters.asset)?.name ?? "Home or vehicle", key: "asset" });
  if (filters.member) chips.push({ label: related.familyMembers.find((m) => m.id === filters.member)?.name ?? "Family member", key: "member" });
  if (filters.from) chips.push({ label: `From ${formatDate(filters.from)}`, key: "from" });
  if (filters.to) chips.push({ label: `To ${formatDate(filters.to)}`, key: "to" });
  const hasFilters = chips.length > 0;
  const parents = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-4">
      <form method="get" className="space-y-3" role="search">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={filters.q} placeholder="Search description, merchant, notes" className="pl-9" aria-label="Search transactions" />
          </div>
          <Button type="submit" variant="secondary" size="icon-lg" aria-label="Search">
            <SearchIcon />
          </Button>
        </div>
        <details className="group rounded-2xl bg-card shadow-card ring-1 ring-border/80" open={hasFilters && !filters.q ? true : undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium">
            <FilterIcon className="size-4" aria-hidden /> Filters
            {hasFilters ? <span className="text-muted-foreground">({chips.length})</span> : null}
          </summary>
          <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Type</span>
              <NativeSelect name="kind" defaultValue={filters.kind ?? ""}>
                <option value="">All types</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
                <option value="transfer">Transfers</option>
                <option value="other">Opening balances & adjustments</option>
              </NativeSelect>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Account</span>
              <NativeSelect name="account" defaultValue={filters.account ?? ""}>
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.is_archived ? " (archived)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Category</span>
              <NativeSelect name="category" defaultValue={filters.category ?? ""}>
                <option value="">All categories</option>
                {parents.map((p) => (
                  <optgroup key={p.id} label={`${p.name} · ${p.kind}`}>
                    <option value={p.id}>All {p.name}</option>
                    {categories
                      .filter((c) => c.parent_id === p.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Person</span>
              <NativeSelect name="person" defaultValue={filters.person ?? ""}>
                <option value="">Everyone</option>
                {ctx.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">From</span>
              <Input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">To</span>
              <Input type="date" name="to" defaultValue={filters.to} />
            </label>
            {filters.asset ? <input type="hidden" name="asset" value={filters.asset} /> : null}
            {filters.member ? <input type="hidden" name="member" value={filters.member} /> : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" className="flex-1">
                Apply filters
              </Button>
              {hasFilters ? (
                <Button asChild variant="ghost">
                  <Link href="/finances/transactions">Clear</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </details>
      </form>

      {hasFilters ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.key}
              href={`/finances/transactions${toQuery(filters, { [c.key]: undefined, page: undefined })}`}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground capitalize"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} <XIcon className="size-3" aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <span>
          {result.total.toLocaleString("en-TT")} transaction{result.total === 1 ? "" : "s"}
          {result.rows.length ? (
            <>
              {" "}
              · net on this page <Money minor={pageTotal} className="text-foreground" />
            </>
          ) : null}
        </span>
        {result.total > 0 ? (
          <a
            href={`/api/export/transactions${toQuery({ ...filters, page: undefined })}`}
            className="inline-flex items-center gap-1 font-medium text-primary"
            download
          >
            <DownloadIcon className="size-4" aria-hidden /> CSV
          </a>
        ) : null}
      </div>

      {result.rows.length ? (
        <TransactionList rows={result.rows} categories={categories} members={ctx.members} timezone={ctx.household.timezone} />
      ) : (
        <EmptyState
          icon={ReceiptIcon}
          title={hasFilters ? "No matching transactions" : "No transactions yet"}
          description={hasFilters ? "Try removing a filter or widening the dates." : "Tap the + button to record your first expense."}
        />
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-2">
          {result.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/finances/transactions${toQuery(filters, { page: result.page - 1 })}`}>
                <ChevronLeftIcon data-icon="inline-start" /> Newer
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {result.page} of {pages}
          </span>
          {result.page < pages ? (
            <Button asChild variant="outline">
              <Link href={`/finances/transactions${toQuery(filters, { page: result.page + 1 })}`}>
                Older <ChevronRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
