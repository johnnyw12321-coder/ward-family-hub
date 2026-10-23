import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccentSync } from "@/components/shared/accent-sync";
import { HealthMark } from "@/features/health/components/health-mark";
import { HealthBottomNav, HealthSidebar } from "@/features/health/components/health-nav";
import { SwitchToHubButton } from "@/features/health/components/mode-switch";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: { default: "Ward Health", template: "%s · Ward Health" },
};

/**
 * Ward Health shell: its own navigation and header, separate from Ward Hub's.
 * Like the Hub shell, the chrome is static and the session streams in; every
 * page still checks the session itself.
 */
export default function HealthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <HealthSidebar />
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 bg-background/85 pt-safe backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 lg:max-w-5xl lg:px-8">
            <Link href="/health" className="flex items-center gap-2 lg:invisible">
              <HealthMark className="size-8 rounded-[10px]" />
              <span className="text-[15px] font-semibold tracking-tight">Ward Health</span>
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <SwitchToHubButton compact />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-36 lg:max-w-5xl lg:px-8 lg:pb-16">
          {children}
        </main>
      </div>
      <HealthBottomNav />
      <Suspense fallback={null}>
        <MemberAccent />
      </Suspense>
    </div>
  );
}

async function MemberAccent() {
  const ctx = await requireHousehold();
  return <AccentSync color={ctx.me.color} />;
}
