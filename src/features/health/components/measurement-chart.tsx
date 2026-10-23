"use client";

import { useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { LineSeriesChart } from "./charts";
import { MEASUREMENT_FIELDS } from "../measurements";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)", "var(--chart-4)"];

type Row = { date: CalendarDate } & Partial<Record<(typeof MEASUREMENT_FIELDS)[number]["key"], number | null>>;

/** Body measurements over time; pick one to see it clearly, or all to compare. */
export function MeasurementChart({ rows, unit }: { rows: Row[]; unit: string }) {
  const available = MEASUREMENT_FIELDS.filter((f) => rows.filter((r) => typeof r[f.key] === "number").length >= 2);
  const [selected, setSelected] = useState<string>(available[0]?.key ?? "waistCm");
  if (!available.length) return <p className="text-sm text-muted-foreground">Record measurements twice to see a chart.</p>;
  const shown = selected === "all" ? available : available.filter((f) => f.key === selected);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Measurement" className="flex flex-wrap gap-1.5">
        {[...available.map((f) => ({ key: f.key as string, label: f.label })), ...(available.length > 1 ? [{ key: "all", label: "All" }] : [])].map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected === o.key}
            onClick={() => setSelected(o.key)}
            className={
              selected === o.key
                ? "h-9 rounded-full bg-foreground px-3.5 text-sm font-medium text-background"
                : "h-9 rounded-full bg-muted px-3.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      <LineSeriesChart
        data={rows}
        series={shown.map((f) => ({ key: f.key, label: f.label, color: COLORS[MEASUREMENT_FIELDS.indexOf(f)] }))}
        unit={unit}
      />
    </div>
  );
}
