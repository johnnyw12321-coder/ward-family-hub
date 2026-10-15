"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/finances", label: "Overview" },
  { href: "/finances/transactions", label: "Transactions" },
  { href: "/finances/accounts", label: "Accounts" },
  { href: "/finances/budgets", label: "Budgets" },
  { href: "/finances/planner", label: "Planner" },
  { href: "/finances/bills", label: "Bills" },
  { href: "/finances/debts", label: "Debts" },
  { href: "/finances/categories", label: "Categories" },
];

function FinanceTabsView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Finances" className="no-print -mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex w-max gap-1.5 pt-2">
        {TABS.map((t) => {
          const active = t.href === "/finances" ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
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

function FinanceTabsWithPath() {
  return <FinanceTabsView pathname={usePathname()} />;
}

/** Active-state needs the URL, which streams in; the fallback is identical minus the highlight. */
export function FinanceTabs() {
  return (
    <Suspense fallback={<FinanceTabsView pathname="" />}>
      <FinanceTabsWithPath />
    </Suspense>
  );
}
