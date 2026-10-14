import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileLockIcon, LockIcon, PlusIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentItem, expiryState } from "@/features/documents/components/document-list";
import { getDocumentCategories, getDocuments, getMfaState } from "@/features/documents/queries";
import { documentFiltersSchema } from "@/features/documents/schemas";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  return (
    <div>
      <PageHeader title="Documents" back={{ href: "/more", label: "More" }} />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Vault searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Vault({ searchParams }: { searchParams: PageProps<"/documents">["searchParams"] }) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = documentFiltersSchema.parse(raw);
  const ctx = await requireHousehold();
  const [categories, docs, mfa] = await Promise.all([
    getDocumentCategories(ctx),
    getDocuments(ctx, { q: filters.q, category: filters.category, archived: filters.archived === "1" }),
    getMfaState(ctx),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const attention = docs.filter((d) => {
    const s = expiryState(d.expiry_date, ctx.today, d.expiry_reminder_days);
    return s === "expired" || s === "soon";
  });
  const usedCategories = categories.filter((c) => docs.some((d) => d.category_id === c.id) || c.id === filters.category);
  const filtered = Boolean(filters.q || filters.category);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Private to your household. Links to files expire after a minute.</p>
        {ctx.canWrite ? (
          <Button asChild>
            <Link href="/documents/new">
              <PlusIcon data-icon="inline-start" /> Add
            </Link>
          </Button>
        ) : null}
      </div>

      {mfa.aal2 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
          <ShieldCheckIcon className="size-4 shrink-0" aria-hidden /> Verified — sensitive documents are shown.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          <span className="flex items-center gap-2">
            <LockIcon className="size-4 shrink-0" aria-hidden />
            {mfa.enrolled ? "Sensitive documents are hidden until you verify." : "Turn on two-factor to keep passports, IDs and medical papers here."}
          </span>
          <Button asChild size="sm" variant="secondary">
            <Link href={mfa.enrolled ? "/verify?next=/documents" : "/settings#security"}>{mfa.enrolled ? "Verify" : "Set up"}</Link>
          </Button>
        </div>
      )}

      <form method="get" role="search" className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="Search names, notes and tags" className="pl-9" aria-label="Search documents" />
        </div>
        {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
        <Button type="submit" variant="secondary" size="icon-lg" aria-label="Search">
          <SearchIcon />
        </Button>
      </form>

      {usedCategories.length > 1 || filters.category ? (
        <nav aria-label="Categories" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <ul className="flex w-max gap-1.5">
            <li>
              <Link
                href={filters.q ? `/documents?q=${encodeURIComponent(filters.q)}` : "/documents"}
                className={cn("flex h-9 items-center rounded-full px-4 text-sm font-medium", !filters.category ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-border")}
              >
                All
              </Link>
            </li>
            {usedCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/documents?category=${c.id}${filters.q ? `&q=${encodeURIComponent(filters.q)}` : ""}`}
                  aria-current={filters.category === c.id ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap",
                    filters.category === c.id ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-border",
                  )}
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {attention.length && !filtered && !filters.archived ? (
        <section>
          <SectionHeading title="Needs attention" />
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {attention.map((d) => (
              <DocumentItem key={d.id} doc={d} category={byId.get(d.category_id)} today={ctx.today} />
            ))}
          </ul>
        </section>
      ) : null}

      {docs.length ? (
        <section>
          <SectionHeading title={filters.archived ? "Archived" : filtered ? `${docs.length} found` : "All documents"} />
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {docs.map((d) => (
              <DocumentItem key={d.id} doc={d} category={byId.get(d.category_id)} today={ctx.today} />
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          icon={FileLockIcon}
          title={filtered ? "No matching documents" : filters.archived ? "Nothing archived" : "The vault is empty"}
          description={filtered ? "Try another search or category." : "Add insurance policies, property papers, vehicle documents, warranties and receipts."}
        />
      )}

      <Link href={filters.archived ? "/documents" : "/documents?archived=1"} className="inline-block px-1 text-sm text-primary">
        {filters.archived ? "Back to current documents" : "Show archived documents"}
      </Link>
    </div>
  );
}
