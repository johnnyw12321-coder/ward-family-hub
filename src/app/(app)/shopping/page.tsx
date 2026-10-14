import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShoppingCartIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { NewListButton } from "@/features/tasks/components/shopping";
import { TasksTabs } from "@/features/tasks/components/tasks-tabs";
import { getShoppingItems, getShoppingLists, type ShoppingList } from "@/features/tasks/shopping-queries";
import { requireHousehold } from "@/lib/auth/context";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Shopping" };

export default function ShoppingPage() {
  return (
    <div>
      <PageHeader title="Tasks & shopping" back={{ href: "/more", label: "More" }} />
      <TasksTabs active="shopping" />
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <ShoppingView />
      </Suspense>
    </div>
  );
}

async function ShoppingView() {
  const ctx = await requireHousehold();
  const lists = await getShoppingLists(ctx);
  const items = await getShoppingItems(ctx, lists.map((l) => l.id));
  const stats = (l: ShoppingList) => {
    const mine = items.filter((i) => i.list_id === l.id);
    const left = mine.filter((i) => !i.is_checked);
    return { total: mine.length, left: left.length, estimate: left.reduce((s, i) => s + (i.estimated_price_minor ?? 0), 0) };
  };
  const active = lists.filter((l) => !l.is_template && !l.is_archived);
  const templates = lists.filter((l) => l.is_template && !l.is_archived);
  const archived = lists.filter((l) => l.is_archived);

  const Row = ({ l }: { l: ShoppingList }) => {
    const s = stats(l);
    return (
      <li>
        <Link href={`/shopping/${l.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/60">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
            <ShoppingCartIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{l.name}</span>
            <span className="block text-xs text-muted-foreground">
              {l.is_template ? `${s.total} items` : s.total ? `${s.left} of ${s.total} left` : "Empty"}
              {s.estimate && !l.is_template ? ` · about ${formatMoney(s.estimate, { currency: ctx.household.base_currency })}` : ""}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">{ctx.canWrite ? <NewListButton templates={templates.map((t) => ({ id: t.id, name: t.name }))} /> : null}</div>
      {active.length ? (
        <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {active.map((l) => (
            <Row key={l.id} l={l} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={ShoppingCartIcon} title="No shopping lists" description="Create a list either of you can add to and tick off in the store." />
      )}
      {templates.length ? (
        <section>
          <SectionHeading title="Reusable lists" />
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {templates.map((l) => (
              <Row key={l.id} l={l} />
            ))}
          </ul>
        </section>
      ) : active.length ? (
        <p className="px-1 text-sm text-muted-foreground">Tip: save a list you buy often (like weekly groceries) as reusable, then start new lists from it.</p>
      ) : null}
      {archived.length ? (
        <section>
          <SectionHeading title="Archived" />
          <ul className="divide-y rounded-2xl bg-card opacity-75 shadow-card ring-1 ring-border/80">
            {archived.map((l) => (
              <Row key={l.id} l={l} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
