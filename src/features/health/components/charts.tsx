"use client";

/**
 * Ward Health charts (Recharts, like Ward Hub's finance charts): values arrive
 * already converted to the person's units. Each chart has a hover tooltip,
 * a legend that doesn't rely on colour alone (solid / dashed / dots), and a
 * table alternative.
 */
import { useId, useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { addDays, dayHeading, formatDate, type CalendarDate } from "@/lib/dates";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(day)}/${Number(m)}`;
};

function TableToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-2">
      <button type="button" className="text-xs font-medium text-primary" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide table" : "Show as table"}
      </button>
      {open ? (
        <div id={id} className="mt-2 max-h-72 overflow-auto">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function RangeToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-8 rounded-md px-3 text-xs font-medium transition-colors", value === o.value ? "bg-card shadow-sm" : "text-muted-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Range = "30" | "90" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All" },
];

export type WeightPoint = { date: CalendarDate; weight: number | null; avg: number | null; goal: number | null };

export function WeightChart({ points, unit, today, height = 240 }: { points: WeightPoint[]; unit: string; today: CalendarDate; height?: number }) {
  const [range, setRange] = useState<Range>("90");
  const data = useMemo(() => (range === "all" ? points : points.filter((p) => p.date >= addDays(today, -Number(range)))), [points, range, today]);
  const values = data.flatMap((p) => [p.weight, p.avg, p.goal]).filter((v): v is number => v !== null);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const hasGoal = data.some((p) => p.goal !== null);
  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden /> Weigh-ins
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-primary" aria-hidden /> 7-day average
          </li>
          {hasGoal ? (
            <li className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-clay" aria-hidden /> Goal line
            </li>
          ) : null}
        </ul>
        <RangeToggle value={range} onChange={setRange} options={RANGES} />
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis domain={[min, max]} tick={axisTick} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
                    <div className="mb-1 font-medium">{dayHeading(String(label))}</div>
                    {(() => {
                      const p = payload[0].payload as WeightPoint;
                      return (
                        <>
                          {p.weight !== null ? <Row label="Weighed" value={`${p.weight} ${unit}`} /> : null}
                          {p.avg !== null ? <Row label="Average" value={`${p.avg} ${unit}`} /> : null}
                          {p.goal !== null ? <Row label="Goal line" value={`${p.goal} ${unit}`} /> : null}
                        </>
                      );
                    })()}
                  </div>
                ) : null
              }
            />
            {hasGoal ? <Line dataKey="goal" stroke="var(--clay)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls /> : null}
            <Scatter dataKey="weight" fill="var(--muted-foreground)" fillOpacity={0.55} isAnimationActive={false} />
            <Line dataKey="avg" stroke="var(--primary)" strokeWidth={2.5} dot={false} connectNulls animationDuration={600} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 text-right font-medium">Weight</th>
              <th className="py-1 text-right font-medium">7-day avg</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {[...data].reverse().filter((p) => p.weight !== null).map((p) => (
              <tr key={p.date} className="border-t">
                <td className="py-1">{formatDate(p.date)}</td>
                <td className="py-1 text-right">{p.weight}</td>
                <td className="py-1 text-right">{p.avg ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </figure>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
  );
}

export type SeriesRow = { date: CalendarDate; [key: string]: number | string | null | undefined };

/** One or more series over time, e.g. body measurements or an exercise's strength. */
export function LineSeriesChart({
  data,
  series,
  unit,
  height = 220,
}: {
  data: SeriesRow[];
  series: { key: string; label: string; color: string; dashed?: boolean }[];
  unit: string;
  height?: number;
}) {
  const values = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === "number");
  const pad = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15);
  return (
    <figure>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={cn("w-4 border-t-2", s.dashed && "border-dashed")} style={{ borderColor: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              domain={[Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
                    <div className="mb-1 font-medium">{dayHeading(String(label))}</div>
                    {series.map((s) => {
                      const v = (payload[0].payload as Record<string, unknown>)[s.key];
                      return typeof v === "number" ? <Row key={s.key} label={s.label} value={`${v} ${unit}`} /> : null;
                    })}
                  </div>
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
                animationDuration={600}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Date</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {[...data].reverse().map((d) => (
              <tr key={d.date} className="border-t">
                <td className="py-1">{formatDate(d.date)}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 text-right">
                    {typeof d[s.key] === "number" ? d[s.key] : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </figure>
  );
}
