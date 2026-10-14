import Link from "next/link";
import { CarIcon, WarehouseIcon } from "lucide-react";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { diffDays, formatDate, type CalendarDate } from "@/lib/dates";
import type { AssetRow } from "../queries";

function nextDue(asset: AssetRow, today: CalendarDate): { label: string; date: CalendarDate } | null {
  const candidates = [
    { label: "Service", date: asset.next_service_date },
    { label: "Insurance", date: asset.insurance_renewal_date },
    { label: "Registration", date: asset.registration_renewal_date },
  ].filter((c): c is { label: string; date: string } => Boolean(c.date));
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  const soon = candidates.find((c) => diffDays(c.date, today) <= 30);
  return soon ?? null;
}

export function AssetCard({ asset, owed, yearCost, today }: { asset: AssetRow; owed: number | null; yearCost: number; today: CalendarDate }) {
  const vehicle = asset.type === "vehicle";
  const Icon = vehicle ? CarIcon : WarehouseIcon;
  const due = vehicle ? nextDue(asset, today) : null;
  const overdue = due ? diffDays(due.date, today) < 0 : false;
  return (
    <Link
      href={`/${vehicle ? "vehicles" : "property"}/${asset.id}`}
      className="block rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{asset.name}</h3>
            {asset.is_archived ? <Badge variant="outline">Archived</Badge> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {vehicle
              ? [asset.model_year, asset.make, asset.model].filter(Boolean).join(" ") +
                (asset.registration_plate ? ` · ${asset.registration_plate}` : "") +
                (asset.current_mileage !== null ? ` · ${asset.current_mileage.toLocaleString("en-TT")} ${asset.mileage_unit}` : "")
              : (asset.address ?? (asset.property_kind ? asset.property_kind[0].toUpperCase() + asset.property_kind.slice(1) : ""))}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Value</dt>
          <dd className="font-semibold">{asset.estimated_value_minor !== null ? <Money minor={asset.estimated_value_minor} compact /> : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{owed !== null ? "Owed" : "Equity"}</dt>
          <dd className="font-semibold">{owed !== null ? <Money minor={owed} compact /> : asset.estimated_value_minor !== null ? <Money minor={asset.estimated_value_minor} compact /> : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Costs {today.slice(0, 4)}</dt>
          <dd className="font-semibold">
            <Money minor={yearCost} compact />
          </dd>
        </div>
      </dl>
      {due ? (
        <p className={`mt-2 text-xs font-medium ${overdue ? "text-destructive" : "text-warning"}`}>
          {due.label} {overdue ? "overdue since" : "due"} {formatDate(due.date)}
        </p>
      ) : null}
    </Link>
  );
}
