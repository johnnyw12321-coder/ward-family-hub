import Link from "next/link";
import { Money } from "@/components/shared/money";
import { percentOf, type Minor } from "@/lib/money";

/**
 * Spending by category as labelled horizontal bars (a single hue: the job is
 * magnitude, so colour does not encode identity). Every row is labelled, so it
 * doubles as its own table.
 */
export function CategoryBars({
  rows,
  total,
  hrefFor,
  limit = 8,
}: {
  rows: { id: string; name: string; total: Minor; count: number }[];
  total: Minor;
  hrefFor?: (id: string) => string;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const otherTotal = rest.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...shown.map((r) => r.total), otherTotal);
  const items = otherTotal > 0 ? [...shown, { id: "other", name: `Other (${rest.length})`, total: otherTotal, count: 0 }] : shown;
  return (
    <ul className="space-y-3">
      {items.map((r) => {
        const width = Math.max(1.5, (r.total / max) * 100);
        const share = percentOf(r.total, total);
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <Money minor={r.total} className="font-medium text-foreground" /> · {share}%
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-series-spend" style={{ width: `${width}%` }} />
            </div>
          </>
        );
        return (
          <li key={r.id}>
            {hrefFor && r.id !== "other" ? (
              <Link href={hrefFor(r.id)} className="block rounded-lg transition-opacity hover:opacity-80" title={`${r.count} transactions`}>
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
