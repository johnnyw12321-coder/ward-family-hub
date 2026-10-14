import Link from "next/link";
import { PhoneIcon, StarIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { getAccounts } from "@/features/finance/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import { yearStart } from "@/lib/dates";
import { isLiability } from "@/lib/finance/calculations";
import { deleteContractor } from "../actions";
import { getAssetCosts, getAssets, getContractors } from "../queries";
import { AddContractorButton, EditContractorButton } from "./asset-buttons";
import { NewAssetButton } from "./asset-forms";
import { AssetCard } from "./asset-list";

/** Shared list page for Home & property and Vehicles. */
export async function AssetListPage({
  ctx,
  type,
  title,
  icon,
  emptyText,
  showArchived,
}: {
  ctx: HouseholdContext;
  type: "property" | "vehicle";
  title: string;
  icon: LucideIcon;
  emptyText: string;
  showArchived: boolean;
}) {
  const [assets, accounts, costs, contractors] = await Promise.all([
    getAssets(ctx, type, { includeArchived: true }),
    getAccounts(ctx, { includeArchived: true }),
    getAssetCosts(ctx, yearStart(ctx.today), ctx.today),
    type === "property" ? getContractors(ctx) : Promise.resolve([]),
  ]);
  const balances = new Map(accounts.map((a) => [a.id, a.balance_minor]));
  const active = assets.filter((a) => !a.is_archived);
  const archived = assets.filter((a) => a.is_archived);
  const loanAccounts = accounts.filter((a) => isLiability(a.type) && a.type !== "credit_card" && !a.is_archived).map((a) => ({ id: a.id, name: a.name }));
  const base = type === "vehicle" ? "/vehicles" : "/property";
  const card = (a: (typeof assets)[number]) => {
    const c = costs.get(a.id) ?? { ledger: 0, logged: 0 };
    const owed = a.loan_account_id ? Math.max(0, -(balances.get(a.loan_account_id) ?? 0)) : null;
    return <AssetCard key={a.id} asset={a} owed={owed} yearCost={c.ledger + c.logged} today={ctx.today} />;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        back={{ href: "/more", label: "More" }}
        actions={ctx.canWrite ? <NewAssetButton type={type} loanAccounts={loanAccounts} currency={ctx.household.base_currency} /> : null}
      />
      {active.length ? <div className="grid gap-3 lg:grid-cols-2">{active.map(card)}</div> : <EmptyState icon={icon} title={`No ${type === "vehicle" ? "vehicles" : "properties"} yet`} description={emptyText} />}

      {type === "property" ? (
        <section>
          <SectionHeading title="Contractors" action={ctx.canWrite ? <AddContractorButton /> : undefined} />
          {contractors.length ? (
            <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
              {contractors.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {c.name}
                      {c.rating ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-warning" aria-label={`${c.rating} out of 5`}>
                          <StarIcon className="size-3 fill-current" aria-hidden /> {c.rating}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{[c.trade, c.email].filter(Boolean).join(" · ") || "No details"}</div>
                  </div>
                  {c.phone ? (
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="flex size-9 items-center justify-center rounded-full text-primary hover:bg-muted" aria-label={`Call ${c.name}`}>
                      <PhoneIcon className="size-4" />
                    </a>
                  ) : null}
                  {ctx.canWrite ? (
                    <>
                      <EditContractorButton
                        initial={{ id: c.id, name: c.name, trade: c.trade ?? "", phone: c.phone ?? "", email: c.email ?? "", rating: c.rating ? (String(c.rating) as "5") : "", notes: c.notes ?? "" }}
                      />
                      <ConfirmAction
                        action={deleteContractor.bind(null, c.id)}
                        trigger={<Trash2Icon aria-label={`Remove ${c.name}`} />}
                        title={`Remove ${c.name}?`}
                        description="Past records keep their details but no longer link to this contractor."
                        confirmLabel="Remove"
                        variant="ghost"
                        size="icon"
                      />
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
              Keep your trusted plumber, electrician, AC technician and mechanic in one place.
            </p>
          )}
        </section>
      ) : null}

      {archived.length ? (
        showArchived ? (
          <section>
            <SectionHeading title="Archived" />
            <div className="grid gap-3 opacity-80 lg:grid-cols-2">{archived.map(card)}</div>
          </section>
        ) : (
          <Link href={`${base}?archived=1`} className="inline-block px-1 text-sm text-primary">
            Show {archived.length} archived
          </Link>
        )
      ) : null}
    </div>
  );
}
