"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Keeps a single line (usually an amount) on one line inside its box by
 * shrinking the font just enough, down to `min` of the normal size. Large
 * balances in narrow phone columns stay readable instead of being cut off.
 */
export function FitText({ children, className, min = 0.55 }: { children: ReactNode; className?: string; min?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = line.current;
    if (!outer || !inner) return;
    const fit = () => {
      inner.style.fontSize = "";
      const available = outer.clientWidth;
      const needed = inner.scrollWidth;
      if (needed <= available || !needed) return;
      const base = parseFloat(getComputedStyle(inner).fontSize);
      // Round down a little so subpixel widths never clip the last digit.
      inner.style.fontSize = `${Math.floor(base * Math.max(min, available / needed) * 10) / 10 - 0.2}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer.disconnect();
  }, [children, min]);

  return (
    <div ref={box} className={cn("min-w-0 overflow-hidden", className)}>
      <span ref={line} className="inline-block whitespace-nowrap">
        {children}
      </span>
    </div>
  );
}
