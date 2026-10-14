"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Logo } from "@/components/shared/logo";
import { MORE_NAV, PRIMARY_NAV, isActive, type NavItem } from "./nav-items";

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.href === "/more" ? false : isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
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
}

function SidebarNavView({ pathname }: { pathname: string }) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar px-3 py-5 lg:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
        <Logo className="size-9" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Ward Family Hub</div>
          <div className="text-xs text-muted-foreground">Our home, organised</div>
        </div>
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {PRIMARY_NAV.filter((i) => i.href !== "/more").map((item) => (
          <SideLink key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
          Household
        </div>
        {MORE_NAV.map((item) => (
          <SideLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarNavWithPath() {
  return <SidebarNavView pathname={usePathname()} />;
}

/** Active-state needs the URL, which streams in; the fallback is identical minus the highlight. */
export function SidebarNav() {
  return (
    <Suspense fallback={<SidebarNavView pathname="" />}>
      <SidebarNavWithPath />
    </Suspense>
  );
}
