"use client";

import { useFormStatus } from "react-dom";
import { ArrowLeftRightIcon, ChevronRightIcon, HouseIcon } from "lucide-react";
import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";
import { switchToHealth, switchToHub } from "../mode-actions";
import { HealthMark } from "./health-mark";

function Pending({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return pending ? <Spinner className="size-4" /> : children;
}

/** The "Switch to Ward Health" row at the top of More. */
export function SwitchToHealthCard() {
  return (
    <form action={switchToHealth}>
      <button
        type="submit"
        className="group flex min-h-[76px] w-full items-center gap-4 overflow-hidden rounded-2xl bg-card px-4 py-3 text-left shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/60"
      >
        <HealthMark className="size-11 transition-transform group-hover:scale-105" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Switch to Ward Health</span>
          <span className="block text-sm text-muted-foreground">Your fitness hub: food, weight, workouts and goals</span>
        </span>
        <Pending>
          <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
        </Pending>
      </button>
    </form>
  );
}

/** Compact version for the desktop sidebar, where More's items live. */
export function SwitchToHealthLink() {
  return (
    <form action={switchToHealth}>
      <button
        type="submit"
        className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground ring-1 ring-border/80 transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
      >
        <HealthMark className="size-6 rounded-md" />
        <span className="flex-1 text-left">Switch to Ward Health</span>
        <Pending>
          <ArrowLeftRightIcon className="size-4" aria-hidden />
        </Pending>
      </button>
    </form>
  );
}

export function SwitchToHubButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <form action={switchToHub} className={className}>
      <button
        type="submit"
        aria-label={compact ? "Switch back to Ward Hub" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-full bg-secondary text-sm font-medium text-secondary-foreground ring-1 ring-border/80 transition-colors hover:bg-muted",
          compact ? "h-10 px-3.5" : "h-11 w-full justify-center px-4",
        )}
      >
        <Pending>
          <HouseIcon className="size-4" aria-hidden />
        </Pending>
        {compact ? "Ward Hub" : "Switch back to Ward Hub"}
      </button>
    </form>
  );
}
