"use client";

import { useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { deleteMeasurement, deleteWeighIn } from "../actions/tracking";
import { formatLength, formatWeight } from "../calc/units";
import type { Measurement, Units, WeighIn } from "../types";
import { report } from "./celebrate";
import { MEASUREMENT_FIELDS } from "../measurements";

export function WeighInList({ weighIns, units }: { weighIns: WeighIn[]; units: Units }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
      {weighIns.map((w, i) => {
        const prev = weighIns[i + 1];
        const diff = prev ? w.weightKg - prev.weightKg : null;
        return (
          <li key={w.id} className="flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium tabular">{formatWeight(w.weightKg, units)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {formatDate(w.onDate)}
                {w.note ? ` · ${w.note}` : ""}
              </div>
            </div>
            {diff !== null && Math.abs(diff) >= 0.05 ? (
              <span className={diff < 0 ? "text-xs text-success tabular" : "text-xs text-muted-foreground tabular"}>{formatWeight(diff, units, { signed: true })}</span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete weigh-in from ${formatDate(w.onDate)}`}
              disabled={pending}
              onClick={() => start(async () => void report(await deleteWeighIn(w.id)))}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function MeasurementList({ rows, units }: { rows: Measurement[]; units: Units }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
      {rows.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{formatDate(m.onDate)}</div>
            <div className="text-xs text-muted-foreground tabular">
              {MEASUREMENT_FIELDS.filter((f) => m[f.key] !== null)
                .map((f) => `${f.label} ${formatLength(m[f.key]!, units)}`)
                .join(" · ")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete measurements from ${formatDate(m.onDate)}`}
            disabled={pending}
            onClick={() => start(async () => void report(await deleteMeasurement(m.id)))}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
