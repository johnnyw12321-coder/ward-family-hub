"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";

type Tab = { href: string; label: string };

/** Pill tabs between a section's pages, matching Ward Hub's Finances tabs. */
function SubTabsView({ label, tabs, pathname }: { label: string; tabs: Tab[]; pathname: string }) {
  return (
    <nav aria-label={label} className="no-print -mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex w-max gap-1.5 pt-2">
        {tabs.map((t, i) => {
          const active = i === 0 ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WithPath(props: { label: string; tabs: Tab[] }) {
  return <SubTabsView {...props} pathname={usePathname()} />;
}

export function SubTabs(props: { label: string; tabs: Tab[] }) {
  return (
    <Suspense fallback={<SubTabsView {...props} pathname="" />}>
      <WithPath {...props} />
    </Suspense>
  );
}
