"use client";

import { useId, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

export type Choice<T extends string> = { value: T; label: string; hint?: string; icon?: ReactNode };

/**
 * Large radio cards (min 56px tall) for choices that deserve an explanation:
 * goal, activity level, sex. Arrow keys move between options, like any radio group.
 */
export function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  choices,
  columns = 1,
  invalid,
}: {
  label: string;
  value: T | undefined;
  onChange: (v: T) => void;
  choices: Choice<T>[];
  columns?: 1 | 2 | 3;
  invalid?: boolean;
}) {
  const id = useId();
  const select = (i: number) => {
    const next = choices[(i + choices.length) % choices.length];
    onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={cn("grid grid-cols-1 gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}
    >
      {choices.map((c, i) => {
        const checked = c.value === value;
        return (
          <button
            key={c.value}
            id={`${id}-${c.value}`}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(c.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                select(i + 1);
              } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                select(i - 1);
              }
            }}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
              checked ? "border-primary bg-accent/60 ring-1 ring-primary" : "border-border hover:bg-muted/60",
              invalid && !value && "border-destructive",
            )}
          >
            {c.icon ? <span className={cn("shrink-0", checked ? "text-primary" : "text-muted-foreground")}>{c.icon}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{c.label}</span>
              {c.hint ? <span className="block text-xs text-muted-foreground">{c.hint}</span> : null}
            </span>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
              aria-hidden
            >
              {checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Two-option pill switch (e.g. metric / imperial). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-xl bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 min-w-20 rounded-lg px-3 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            o.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
