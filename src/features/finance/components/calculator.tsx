"use client";

import { useState } from "react";
import { DeleteIcon } from "lucide-react";
import { cn } from "cn";
import { evaluate, formatResult } from "@/lib/calc";

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="] as const;
const OPS = new Set(["÷", "×", "−", "+"]);

/** A plain calculator for quick sums; the keyboard works too. */
export function Calculator() {
  const [expr, setExpr] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const live = expr ? evaluate(expr) : null;

  const press = (k: (typeof KEYS)[number] | string) => {
    if (k === "C") {
      setExpr("");
      setLast(null);
    } else if (k === "⌫") setExpr((e) => e.slice(0, -1));
    else if (k === "=") {
      if (live !== null) {
        setLast(expr);
        setExpr(formatResult(live));
      }
    } else setExpr((e) => (e.length < 60 ? e + k : e));
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl bg-muted/60 px-4 py-3 text-right"
        tabIndex={0}
        aria-label="Calculator display"
        onKeyDown={(e) => {
          const map: Record<string, string> = { "*": "×", "/": "÷", "-": "−", Enter: "=", Backspace: "⌫", Escape: "C" };
          const k = map[e.key] ?? e.key;
          if (/^[0-9.()+]$/.test(k) || OPS.has(k) || ["=", "⌫", "C"].includes(k)) {
            e.preventDefault();
            press(k);
          }
        }}
      >
        <div className="min-h-4 truncate text-xs text-muted-foreground">{last ? `${last} =` : " "}</div>
        <div className="truncate text-2xl font-semibold tabular" aria-live="polite">
          {expr || "0"}
        </div>
        <div className="min-h-5 text-sm text-muted-foreground tabular">{live !== null && expr !== formatResult(live) ? `= ${formatResult(live)}` : " "}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === "⌫" ? "Backspace" : k === "C" ? "Clear" : k === "−" ? "Minus" : k === "×" ? "Times" : k === "÷" ? "Divide by" : k === "=" ? "Equals" : undefined}
            className={cn(
              "flex h-14 items-center justify-center rounded-xl text-lg font-medium transition-colors active:scale-95",
              k === "=" ? "bg-primary text-primary-foreground" : OPS.has(k) ? "bg-accent text-accent-foreground" : k === "C" ? "bg-muted text-destructive" : "bg-muted hover:bg-muted/70",
            )}
          >
            {k === "⌫" ? <DeleteIcon className="size-5" aria-hidden /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
