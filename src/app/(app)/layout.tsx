import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { QuickAdd } from "@/components/layout/quick-add";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { AccentSync } from "@/components/shared/accent-sync";
import { Logo } from "@/components/shared/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { getAboutOptions } from "@/features/calendar/about-options";
import { getAccounts, getCategories } from "@/features/finance/queries";
import { QUICK_ADD_LINKS } from "@/features/registry";
import { refreshAndCountUnread } from "@/features/notifications/queries";
import { requireHousehold } from "@/lib/auth/context";
import { BellIcon } from "lucide-react";

/**
 * Authenticated shell. The chrome (navigation) is static and renders
 * instantly; anything that depends on the session streams in behind Suspense.
 * Every page also calls requireHousehold() itself — the layout is not the
 * authorization boundary.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <SidebarNav />
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 bg-background/85 pt-safe backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 lg:max-w-5xl lg:px-8">
            <Link href="/" className="flex items-center gap-2 lg:invisible">
              <Logo className="size-8" />
              <span className="text-[15px] font-semibold tracking-tight">Ward Hub</span>
            </Link>
            <div className="flex items-center gap-2">
              <Suspense fallback={<Skeleton className="h-10 w-[5.5rem] rounded-full" />}>
                <AccountControls />
              </Suspense>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-36 lg:max-w-5xl lg:px-8 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
      <Suspense fallback={null}>
        <QuickAddLoader />
      </Suspense>
    </div>
  );
}

async function AccountControls() {
  const ctx = await requireHousehold();
  const unread = await refreshAndCountUnread(ctx);
  return (
    <>
      <AccentSync color={ctx.me.color} />
      <Link
        href="/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BellIcon className="size-5" aria-hidden />
        {unread ? (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
      <UserMenu
        name={ctx.me.display_name}
        email={ctx.email}
        color={ctx.me.color}
        householdName={ctx.household.name}
      />
    </>
  );
}

async function QuickAddLoader() {
  const ctx = await requireHousehold();
  if (!ctx.canWrite) return null;
  const [accounts, categories, related] = await Promise.all([getAccounts(ctx), getCategories(ctx), getAboutOptions(ctx)]);
  return (
    <QuickAdd
      data={{
        accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency })),
        categories,
        related,
        members: ctx.members.filter((m) => m.role !== "viewer").map((m) => ({ user_id: m.user_id, display_name: m.display_name })),
        meId: ctx.userId,
        timezone: ctx.household.timezone,
        currency: ctx.household.base_currency,
        canWrite: ctx.canWrite,
        links: QUICK_ADD_LINKS,
      }}
    />
  );
}
