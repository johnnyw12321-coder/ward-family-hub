import { AlertTriangleIcon } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/shared/money";
import { budgetStatus } from "@/lib/finance/calculations";
import type { Minor } from "@/lib/money";

/** Progress bar for one budget line with an optional "expected by today" marker. */
export function BudgetBar({
  name,
  allocated,
  carriedIn,
  spent,
  pacePercent,
  compact,
}: {
  name: string;
  allocated: Minor;
  carriedIn: Minor;
  spent: Minor;
  pacePercent?: number;
  compact?: boolean;
}) {
  const s = budgetStatus(allocated, carriedIn, spent);
  const width = Math.min(100, s.percentUsed);
  const barColor = s.level === "over" ? "bg-destructive" : s.level === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("space-y-1.5", compact ? "py-2" : "py-3")}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
          {s.level !== "ok" ? (
            <AlertTriangleIcon
              className={cn("size-3.5 shrink-0", s.level === "over" ? "text-destructive" : "text-warning")}
              aria-label={s.level === "over" ? "Over budget" : "Approaching budget"}
            />
          ) : null}
          <span className="truncate">{name}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          <Money minor={spent} trimZeroCents className="font-medium text-foreground" /> of{" "}
          <Money minor={s.available} trimZeroCents />
        </span>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${name} budget used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, s.percentUsed))}
      >
        <div className={cn("h-full rounded-full transition-[width]", barColor)} style={{ width: `${width}%` }} />
        {pacePercent !== undefined && pacePercent < 100 ? (
          <div className="absolute top-0 h-full w-0.5 bg-foreground/30" style={{ left: `${pacePercent}%` }} aria-hidden />
        ) : null}
      </div>
      {!compact ? (
        <div className={cn("text-xs", s.remaining < 0 ? "text-destructive" : "text-muted-foreground")}>
          {s.remaining < 0 ? (
            <>
              <Money minor={-s.remaining} /> over budget
            </>
          ) : (
            <>
              <Money minor={s.remaining} /> left
              {carriedIn > 0 ? (
                <>
                  {" "}
                  · includes <Money minor={carriedIn} /> carried forward
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
