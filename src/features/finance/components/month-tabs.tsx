"use client";

import { useState, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Switch between this month and next without a page load. Both panels are
 * rendered on the server; hidden ones stay mounted so an open form survives.
 */
export function MonthTabs({ tabs, label }: { tabs: { key: string; label: string; badge?: string; content: ReactNode }[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-3 flex w-fit gap-1 rounded-full bg-card p-1 ring-1 ring-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
              active === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] leading-5 tabular",
                  active === t.key ? "bg-background/20" : "bg-muted text-foreground",
                )}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
