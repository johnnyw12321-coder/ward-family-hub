"use client";

import { useTransition } from "react";
import { PartyPopperIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { markBadgesSeen } from "../actions/data";
import type { Badge } from "../calc/achievements";
import { BADGE_ICONS } from "./badges";

const DOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Milestone celebration: shown on the dashboard until dismissed. */
export function Celebration({ badges }: { badges: Badge[] }) {
  const [pending, start] = useTransition();
  return (
    <section
      aria-labelledby="celebration-title"
      className="relative overflow-hidden rounded-2xl bg-warning-soft p-5 shadow-card ring-1 ring-warning/30 animate-in fade-in zoom-in-95 duration-500"
    >
      {/* Decorative confetti; motion is skipped for people who prefer reduced motion. */}
      <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="absolute size-1.5 rounded-full animate-in fade-in slide-in-from-top-8 fill-mode-both"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 70}%`,
              background: DOTS[i % DOTS.length],
              animationDelay: `${i * 60}ms`,
              animationDuration: "900ms",
            }}
          />
        ))}
      </div>
      <div className="relative flex items-start gap-3">
        <PartyPopperIcon className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="celebration-title" className="font-semibold">
            {badges.length === 1 ? "You earned a badge!" : `You earned ${badges.length} badges!`}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {badges.map((b) => {
              const Icon = BADGE_ICONS[b.icon];
              return (
                <li key={b.key} className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 text-warning" aria-hidden />
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground">— {b.description}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <Button className="relative mt-4" onClick={() => start(async () => void (await markBadgesSeen()))} disabled={pending}>
        {pending ? <Spinner /> : null}
        Nice!
      </Button>
    </section>
  );
}
