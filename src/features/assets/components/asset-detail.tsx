import Link from "next/link";
import { ArchiveIcon, ArchiveRestoreIcon, Trash2Icon, WrenchIcon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { LinkedDocuments } from "@/features/documents/components/linked-documents";
import { TransactionList } from "@/features/finance/components/transaction-list";
import { getAccounts, getCategories, getTransactions } from "@/features/finance/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import { diffDays, formatDate, yearStart } from "@/lib/dates";
import { isLiability } from "@/lib/finance/calculations";
import { minorToInput } from "@/lib/money";
import { deleteAsset, deleteItem, deleteRecord, deleteValuation, setAssetArchived } from "../actions";
import { getAssetCosts, getAssetItems, getAssetRecords, getContractors, getValuations, type AssetRow } from "../queries";
import { RECORD_KIND_LABELS } from "../schemas";
import { AddItemButton, AddRecordButton, EditItemButton, EditRecordButton } from "./asset-buttons";
import { EditAssetButton, ValuationButton } from "./asset-forms";

function dueBadge(label: string, date: string | null, today: string) {
  if (!date) return null;
  const d = diffDays(date, today);
  const tone = d < 0 ? "text-destructive" : d <= 30 ? "text-warning" : "text-muted-foreground";
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${tone}`}>
        {formatDate(date)}
        {d < 0 ? " · overdue" : d <= 30 ? ` · in ${d} days` : ""}
      </dd>
    </div>
  );
}

export async function AssetDetail({ ctx, asset }: { ctx: HouseholdContext; asset: AssetRow }) {
  const vehicle = asset.type === "vehicle";
  const base = vehicle ? "/vehicles" : "/property";
  const [records, items, valuations, contractors, accounts, categories, costsYear, costsAll, recent] = await Promise.all([
    getAssetRecords(ctx, asset.id),
    getAssetItems(ctx, asset.id),
    getValuations(ctx, asset.id),
    getContractors(ctx),
    getAccounts(ctx, { includeArchived: true }),
    getCategories(ctx, { kind: "expense" }),
    getAssetCosts(ctx, yearStart(ctx.today), ctx.today),
    getAssetCosts(ctx, "1900-01-01", ctx.today),
    getTransactions(ctx, { asset: asset.id }, { pageSize: 8 }),
  ]);
  const loan = accounts.find((a) => a.id === asset.loan_account_id);
  const owed = loan ? Math.max(0, -loan.balance_minor) : 0;
  const equity = asset.estimated_value_minor !== null ? asset.estimated_value_minor - owed : null;
  const year = costsYear.get(asset.id) ?? { ledger: 0, logged: 0 };
  const all = costsAll.get(asset.id) ?? { ledger: 0, logged: 0 };
  const contractorOptions = contractors.map((c) => ({ id: c.id, name: c.name }));
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));
  const spendAccounts = accounts.filter((a) => !a.is_archived && (!isLiability(a.type) || a.type === "credit_card")).map((a) => ({ id: a.id, name: a.name }));
  const parents = new Map(categories.filter((c) => !c.parent_id).map((c) => [c.id, c.name]));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, group: c.parent_id ? (parents.get(c.parent_id) ?? "Other") : c.name }));
  const recordProps = {
    assetId: asset.id,
    contractors: contractorOptions,
    accounts: spendAccounts,
    categories: categoryOptions,
    currency: asset.currency,
    today: ctx.today,
    vehicle,
  };
  const loanAccounts = accounts.filter((a) => isLiability(a.type) && a.type !== "credit_card").map((a) => ({ id: a.id, name: a.name }));
  const subtitle = vehicle
    ? [asset.model_year, asset.make, asset.model].filter(Boolean).join(" ") + (asset.registration_plate ? ` · ${asset.registration_plate}` : "")
    : (asset.address ?? undefined);

  return (
    <div className="space-y-5">
      <PageHeader
        title={asset.name}
        description={subtitle || undefined}
        back={{ href: base, label: vehicle ? "Vehicles" : "Home & property" }}
        actions={asset.is_archived ? <Badge variant="outline">Archived</Badge> : null}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Estimated value"
          value={asset.estimated_value_minor !== null ? <Money minor={asset.estimated_value_minor} trimZeroCents /> : "—"}
          hint={asset.value_as_of ? `as of ${formatDate(asset.value_as_of)}` : "Not valued yet"}
        />
        {loan ? (
          <StatCard label={vehicle ? "Loan owed" : "Mortgage owed"} value={<Money minor={owed} trimZeroCents />} href={`/finances/accounts/${loan.id}`} />
        ) : null}
        {equity !== null && loan ? <StatCard label="Equity" value={<Money minor={equity} trimZeroCents />} tone="primary" /> : null}
        {vehicle && asset.current_mileage !== null ? (
          <StatCard
            label="Odometer"
            value={`${asset.current_mileage.toLocaleString("en-TT")} ${asset.mileage_unit}`}
            hint={asset.mileage_as_of ? `as of ${formatDate(asset.mileage_as_of)}` : undefined}
          />
        ) : null}
        <StatCard
          label={`Costs ${ctx.today.slice(0, 4)}`}
          value={<Money minor={year.ledger + year.logged} trimZeroCents />}
          hint={year.logged ? <>incl. <Money minor={year.logged} trimZeroCents /> not in accounts</> : "From linked expenses"}
        />
      </div>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <AddRecordButton {...recordProps} />
          <ValuationButton assetId={asset.id} currency={asset.currency} today={ctx.today} />
          <EditAssetButton
            type={vehicle ? "vehicle" : "property"}
            loanAccounts={loanAccounts}
            currency={asset.currency}
            initial={{
              id: asset.id,
              type: asset.type,
              name: asset.name,
              purchaseDate: asset.purchase_date ?? "",
              purchasePrice: minorToInput(asset.purchase_price_minor),
              loanAccountId: asset.loan_account_id ?? "",
              includeInNetWorth: asset.include_in_net_worth,
              notes: asset.notes ?? "",
              address: asset.address ?? "",
              propertyKind: (asset.property_kind as "house") ?? "",
              make: asset.make ?? "",
              model: asset.model ?? "",
              modelYear: asset.model_year ? String(asset.model_year) : "",
              registrationPlate: asset.registration_plate ?? "",
              vin: asset.vin ?? "",
              colour: asset.colour ?? "",
              mileageUnit: asset.mileage_unit,
              currentMileage: asset.current_mileage !== null ? String(asset.current_mileage) : "",
              insuranceRenewalDate: asset.insurance_renewal_date ?? "",
              registrationRenewalDate: asset.registration_renewal_date ?? "",
              nextServiceDate: asset.next_service_date ?? "",
              nextServiceMileage: asset.next_service_mileage !== null ? String(asset.next_service_mileage) : "",
            }}
          />
        </div>
      ) : null}

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <dl className="divide-y text-sm">
          {vehicle ? (
            <>
              {dueBadge("Next service", asset.next_service_date, ctx.today)}
              {asset.next_service_mileage !== null ? (
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">Service at</dt>
                  <dd className="font-medium">
                    {asset.next_service_mileage.toLocaleString("en-TT")} {asset.mileage_unit}
                    {asset.current_mileage !== null && asset.next_service_mileage - asset.current_mileage <= 1000
                      ? ` · ${Math.max(0, asset.next_service_mileage - asset.current_mileage).toLocaleString("en-TT")} to go`
                      : ""}
                  </dd>
                </div>
              ) : null}
              {dueBadge("Insurance renews", asset.insurance_renewal_date, ctx.today)}
              {dueBadge("Registration renews", asset.registration_renewal_date, ctx.today)}
              {asset.vin ? (
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">VIN</dt>
                  <dd className="font-mono text-xs">{asset.vin}</dd>
                </div>
              ) : null}
            </>
          ) : null}
          {asset.purchase_date || asset.purchase_price_minor !== null ? (
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">Bought</dt>
              <dd className="font-medium">
                {asset.purchase_date ? formatDate(asset.purchase_date) : ""}
                {asset.purchase_price_minor !== null ? (
                  <>
                    {asset.purchase_date ? " · " : ""}
                    <Money minor={asset.purchase_price_minor} trimZeroCents />
                  </>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">All-time running costs</dt>
            <dd className="font-medium">
              <Money minor={all.ledger + all.logged} trimZeroCents />
            </dd>
          </div>
        </dl>
        {asset.notes ? <p className="mt-3 text-sm whitespace-pre-wrap">{asset.notes}</p> : null}
      </section>

      <section>
        <SectionHeading title={vehicle ? "Service & repair history" : "Maintenance & improvements"} />
        {records.length ? (
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {records.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
                  <WrenchIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      RECORD_KIND_LABELS[r.kind as keyof typeof RECORD_KIND_LABELS],
                      formatDate(r.performed_on),
                      r.mileage !== null ? `${r.mileage.toLocaleString("en-TT")} ${asset.mileage_unit}` : null,
                      r.contractor_id ? contractorName.get(r.contractor_id) : null,
                      r.next_due_date ? `next ${formatDate(r.next_due_date)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {r.transaction_id ? (
                    <Link href={`/finances/transactions/${r.transaction_id}`} className="text-xs text-primary">
                      In your accounts
                    </Link>
                  ) : r.cost_minor ? (
                    <span className="text-xs text-muted-foreground">Not in your accounts</span>
                  ) : null}
                </div>
                {r.cost_minor !== null ? <Money minor={r.cost_minor} className="text-sm font-medium" /> : null}
                {ctx.canWrite ? (
                  <div className="flex">
                    <EditRecordButton
                      {...recordProps}
                      initial={{
                        id: r.id,
                        assetId: asset.id,
                        kind: r.kind as "repair",
                        title: r.title,
                        performedOn: r.performed_on,
                        cost: minorToInput(r.cost_minor),
                        contractorId: r.contractor_id ?? "",
                        mileage: r.mileage !== null ? String(r.mileage) : "",
                        nextDueDate: r.next_due_date ?? "",
                        notes: r.notes ?? "",
                        recordExpense: false,
                      }}
                    />
                    <ConfirmAction
                      action={deleteRecord.bind(null, r.id)}
                      trigger={<Trash2Icon aria-label="Delete record" />}
                      title="Delete this record?"
                      description={r.transaction_id ? "The linked expense stays in your transactions." : "This can't be undone."}
                      confirmLabel="Delete"
                      variant="ghost"
                      size="icon"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
            Nothing logged yet. Keeping a record helps with resale, warranties and planning.
          </p>
        )}
      </section>

      <section>
        <SectionHeading title={vehicle ? "Parts & warranties" : "Appliances & warranties"} action={ctx.canWrite ? <AddItemButton assetId={asset.id} currency={asset.currency} /> : undefined} />
        {items.length ? (
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {items.map((i) => {
              const days = i.warranty_expires_on ? diffDays(i.warranty_expires_on, ctx.today) : null;
              return (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[i.brand, i.model, i.serial_number ? `S/N ${i.serial_number}` : null].filter(Boolean).join(" · ") || "No details"}
                    </div>
                  </div>
                  {i.warranty_expires_on ? (
                    <span className={days !== null && days < 0 ? "text-xs text-muted-foreground" : days !== null && days <= 30 ? "text-xs font-medium text-warning" : "text-xs text-muted-foreground"}>
                      {days !== null && days < 0 ? "Warranty ended" : `Warranty to ${formatDate(i.warranty_expires_on)}`}
                    </span>
                  ) : null}
                  {ctx.canWrite ? (
                    <div className="flex">
                      <EditItemButton
                        assetId={asset.id}
                        currency={asset.currency}
                        initial={{
                          id: i.id,
                          assetId: asset.id,
                          name: i.name,
                          brand: i.brand ?? "",
                          model: i.model ?? "",
                          serialNumber: i.serial_number ?? "",
                          purchaseDate: i.purchase_date ?? "",
                          price: minorToInput(i.price_minor),
                          warrantyExpiresOn: i.warranty_expires_on ?? "",
                          notes: i.notes ?? "",
                        }}
                      />
                      <ConfirmAction
                        action={deleteItem.bind(null, i.id)}
                        trigger={<Trash2Icon aria-label={`Delete ${i.name}`} />}
                        title={`Remove ${i.name}?`}
                        description="This can't be undone."
                        confirmLabel="Remove"
                        variant="ghost"
                        size="icon"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
            Add appliances and parts to get a reminder before warranties end.
          </p>
        )}
      </section>

      <LinkedDocuments
        ctx={ctx}
        filter={{ assetId: asset.id }}
        title="Documents"
        attachHref={`/documents/new?asset=${asset.id}&category=${vehicle ? "vehicles" : "property"}`}
        attachLabel="Attach"
      />

      <section>
        <SectionHeading
          title="Linked spending"
          action={
            recent.total > recent.rows.length ? (
              <Link href={`/finances/transactions?asset=${asset.id}`} className="text-sm font-medium text-primary">
                All {recent.total}
              </Link>
            ) : undefined
          }
        />
        {recent.rows.length ? (
          <TransactionList rows={recent.rows} categories={categories} members={ctx.members} timezone={ctx.household.timezone} />
        ) : (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-card ring-1 ring-border/80">
            Link expenses to this {vehicle ? "vehicle" : "property"} (under “More details” when adding a transaction) to see the true cost of ownership.
          </p>
        )}
      </section>

      {valuations.length ? (
        <section>
          <SectionHeading title="Value history" />
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card ring-1 ring-border/80">
            {valuations.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1">
                  {formatDate(v.valued_on)}
                  {v.note ? <span className="text-muted-foreground"> · {v.note}</span> : null}
                </span>
                <Money minor={v.value_minor} trimZeroCents className="font-medium" />
                {ctx.canWrite ? (
                  <ConfirmAction
                    action={deleteValuation.bind(null, v.id)}
                    trigger={<Trash2Icon aria-label="Delete valuation" />}
                    title="Delete this valuation?"
                    description="The latest remaining valuation becomes the current value."
                    confirmLabel="Delete"
                    variant="ghost"
                    size="icon"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <ConfirmAction
            action={setAssetArchived.bind(null, asset.id, !asset.is_archived)}
            trigger={
              asset.is_archived ? (
                <>
                  <ArchiveRestoreIcon data-icon="inline-start" /> Restore
                </>
              ) : (
                <>
                  <ArchiveIcon data-icon="inline-start" /> {vehicle ? "Sold or retired" : "Archive"}
                </>
              )
            }
            title={asset.is_archived ? "Restore?" : "Archive?"}
            description={asset.is_archived ? "It returns to the list." : "It leaves net worth and reminders, but its full history is kept."}
            confirmLabel={asset.is_archived ? "Restore" : "Archive"}
            destructive={false}
          />
          <ConfirmAction
            action={deleteAsset.bind(null, asset.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete permanently?"
            description="Its records, items and value history are deleted. Linked transactions and documents are kept but unlinked. Archiving is usually better."
            confirmLabel="Delete"
            redirectTo={base}
            variant="destructive"
          />
        </div>
      ) : null}
    </div>
  );
}
