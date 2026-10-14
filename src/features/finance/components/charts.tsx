"use client";

/**
 * Finance charts. Values arrive as integer minor units and are only formatted
 * (never computed on) here. Series colours come from validated theme tokens
 * (--series-income / --series-spend); text always uses text tokens.
 * Each chart has a hover tooltip and a table alternative.
 */
import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, type Minor } from "@/lib/money";
import { monthLabel, shortMonth, type CalendarDate } from "@/lib/dates";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const compact = (v: number) => formatMoney(Math.round(v), { compact: true });

function ChartTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  label?: unknown;
  rows: (point: Record<string, number | string>) => { label: string; value: Minor; swatch?: string }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Record<string, number | string>;
  return (
    <div className="min-w-44 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <div className="mb-1 font-medium">{monthLabel(String(label) as CalendarDate)}</div>
      {rows(point).map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.swatch ? <span className="size-2.5 rounded-sm" style={{ background: r.swatch }} aria-hidden /> : null}
            {r.label}
          </span>
          <span className="font-medium tabular">{formatMoney(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function TableToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs font-medium text-primary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide table" : "Show as table"}
      </button>
      {open ? (
        <div id={id} className="mt-2 overflow-x-auto">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export type MonthlyPoint = { month: CalendarDate; income: Minor; expense: Minor };

export function IncomeExpenseChart({ data, height = 220 }: { data: MonthlyPoint[]; height?: number }) {
  const income = "var(--series-income)";
  const spend = "var(--series-spend)";
  return (
    <figure>
      <Legend
        items={[
          { label: "Income", color: income },
          { label: "Spending", color: spend },
        ]}
      />
      <div className="mt-2" style={{ height }} role="img" aria-label="Monthly income and spending">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="month" tickFormatter={(m: string) => shortMonth(m)} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} width={64} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={(p) => (
                <ChartTooltip
                  active={p.active}
                  payload={p.payload}
                  label={p.label}
                  rows={(pt) => [
                    { label: "Income", value: Number(pt.income), swatch: income },
                    { label: "Spending", value: Number(pt.expense), swatch: spend },
                    { label: "Net", value: Number(pt.income) - Number(pt.expense) },
                  ]}
                />
              )}
            />
            <Bar dataKey="income" name="Income" fill={income} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" name="Spending" fill={spend} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Month</th>
              <th className="py-1 text-right font-medium">Income</th>
              <th className="py-1 text-right font-medium">Spending</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((d) => (
              <tr key={d.month} className="border-t">
                <td className="py-1">{monthLabel(d.month, "short")}</td>
                <td className="py-1 text-right">{formatMoney(d.income)}</td>
                <td className="py-1 text-right">{formatMoney(d.expense)}</td>
                <td className="py-1 text-right">{formatMoney(d.income - d.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </figure>
  );
}

export type NetWorthPoint = { month: CalendarDate; assets: Minor; liabilities: Minor };

export function NetWorthChart({ data, height = 200 }: { data: NetWorthPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, net: d.assets - d.liabilities }));
  const last = rows.at(-1);
  return (
    <figure>
      <div style={{ height }} role="img" aria-label="Net worth by month">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickFormatter={(m: string) => shortMonth(m)} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} width={64} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={(p) => (
                <ChartTooltip
                  active={p.active}
                  payload={p.payload}
                  label={p.label}
                  rows={(pt) => [
                    { label: "Net worth", value: Number(pt.net), swatch: "var(--series-income)" },
                    { label: "Assets", value: Number(pt.assets) },
                    { label: "Owed", value: Number(pt.liabilities) },
                  ]}
                />
              )}
            />
            <Line
              type="monotone"
              dataKey="net"
              stroke="var(--series-income)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {last ? (
        <figcaption className="mt-1 text-xs text-muted-foreground">
          {monthLabel(last.month)}: <span className="font-medium text-foreground">{formatMoney(last.net)}</span> — accounts plus
          the latest valuations of your home and vehicles
        </figcaption>
      ) : null}
      <TableToggle>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Month end</th>
              <th className="py-1 text-right font-medium">Assets</th>
              <th className="py-1 text-right font-medium">Owed</th>
              <th className="py-1 text-right font-medium">Net worth</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((d) => (
              <tr key={d.month} className="border-t">
                <td className="py-1">{monthLabel(d.month, "short")}</td>
                <td className="py-1 text-right">{formatMoney(d.assets)}</td>
                <td className="py-1 text-right">{formatMoney(d.liabilities)}</td>
                <td className="py-1 text-right">{formatMoney(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </figure>
  );
}
