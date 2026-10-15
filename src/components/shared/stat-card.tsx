import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "cn";
import { FitText } from "@/components/shared/fit-text";

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "primary";
  className?: string;
}) {
  const body = (
    <>
      <div className={cn("text-xs font-medium", tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {label}
      </div>
      <FitText className="mt-1 text-xl font-semibold tracking-tight tabular lg:text-2xl">{value}</FitText>
      {hint ? (
        <div className={cn("mt-1 text-xs", tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</div>
      ) : null}
    </>
  );
  const classes = cn(
    "block min-w-0 rounded-2xl p-4 shadow-card ring-1",
    tone === "primary" ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border/80",
    href && "transition-colors hover:bg-muted/50",
    className,
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
