"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { DumbbellIcon, GaugeIcon, SaladIcon, ScaleIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { HealthMark } from "./health-mark";
import { SwitchToHubButton } from "./mode-switch";

type HealthNavItem = { href: string; label: string; icon: LucideIcon };

export const HEALTH_NAV: HealthNavItem[] = [
  { href: "/health", label: "Dashboard", icon: GaugeIcon },
  { href: "/health/diet", label: "Diet", icon: SaladIcon },
  { href: "/health/track", label: "Track", icon: ScaleIcon },
  { href: "/health/workouts", label: "Workouts", icon: DumbbellIcon },
  { href: "/health/profile", label: "Profile", icon: UserRoundIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/health") return pathname === "/health";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BottomNavView({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Ward Health"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-safe backdrop-blur-lg supports-[backdrop-filter]:bg-card/75 lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {HEALTH_NAV.map((item) => {
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
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent")}>
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

function SidebarView({ pathname }: { pathname: string }) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar px-3 py-5 lg:flex">
      <Link href="/health" className="mb-6 flex items-center gap-2.5 px-2">
        <HealthMark className="size-9" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Ward Health</div>
          <div className="text-xs text-muted-foreground">Stronger every week</div>
        </div>
      </Link>
      <nav aria-label="Ward Health" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {HEALTH_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-primary")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <SwitchToHubButton />
    </aside>
  );
}

function WithPath({ view: View }: { view: typeof BottomNavView }) {
  return <View pathname={usePathname()} />;
}

/** Active-state needs the URL, which streams in; the fallback is identical minus the highlight. */
export function HealthBottomNav() {
  return (
    <Suspense fallback={<BottomNavView pathname="" />}>
      <WithPath view={BottomNavView} />
    </Suspense>
  );
}

export function HealthSidebar() {
  return (
    <Suspense fallback={<SidebarView pathname="" />}>
      <WithPath view={SidebarView} />
    </Suspense>
  );
}
