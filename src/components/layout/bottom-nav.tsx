"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { PRIMARY_NAV, isActive } from "./nav-items";

function BottomNavView({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-safe backdrop-blur-lg supports-[backdrop-filter]:bg-card/75 lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-accent",
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BottomNavWithPath() {
  return <BottomNavView pathname={usePathname()} />;
}

/** Active-state needs the URL, which streams in; the fallback is identical minus the highlight. */
export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavView pathname="" />}>
      <BottomNavWithPath />
    </Suspense>
  );
}
