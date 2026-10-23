import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Circular progress. The ring animates when its value changes (CSS
 * transition, which reduced-motion settings shorten via the global rule).
 * Over 100% the ring stays full and switches to the warning colour.
 */
export function ProgressRing({
  value,
  max,
  size = 120,
  stroke = 10,
  color = "var(--primary)",
  label,
  children,
  className,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** Accessible description, e.g. "1,240 of 2,100 calories". */
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? value / max : 0;
  const over = ratio > 1.0001;
  const shown = Math.min(1, Math.max(0, ratio));
  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--warning)" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div> : null}
    </div>
  );
}
