import { cn } from "cn";
import { formatMoney, type Minor } from "@/lib/money";

type Props = {
  minor: Minor;
  currency?: string;
  /** colour positive values as income and show an explicit sign */
  tone?: "plain" | "signed" | "income" | "muted";
  trimZeroCents?: boolean;
  compact?: boolean;
  className?: string;
};

export function Money({ minor, currency, tone = "plain", trimZeroCents, compact, className }: Props) {
  const text = formatMoney(minor, {
    currency,
    trimZeroCents,
    compact,
    signDisplay: tone === "signed" ? "exceptZero" : "auto",
  });
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        tone === "signed" && minor > 0 && "text-income",
        tone === "income" && "text-income",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
