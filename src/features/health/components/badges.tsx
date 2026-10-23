import { DropletIcon, DumbbellIcon, FlameIcon, MedalIcon, RulerIcon, ScaleIcon, TargetIcon, TrophyIcon, UtensilsIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { formatDate } from "@/lib/dates";
import type { Badge, BadgeIcon } from "../calc/achievements";

export const BADGE_ICONS: Record<BadgeIcon, LucideIcon> = {
  scale: ScaleIcon,
  utensils: UtensilsIcon,
  flame: FlameIcon,
  dumbbell: DumbbellIcon,
  trophy: TrophyIcon,
  droplet: DropletIcon,
  ruler: RulerIcon,
  target: TargetIcon,
  medal: MedalIcon,
};

export function BadgeTile({ badge, earnedOn }: { badge: Badge; earnedOn: string | null }) {
  const Icon = BADGE_ICONS[badge.icon];
  const earned = earnedOn !== null;
  return (
    <li
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl p-4 text-center ring-1 transition-colors",
        earned ? "bg-card shadow-card ring-border/80" : "bg-muted/40 ring-transparent",
      )}
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          earned ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground/50",
        )}
      >
        <Icon className="size-7" aria-hidden />
      </span>
      <span className={cn("text-sm font-semibold", !earned && "text-muted-foreground")}>{badge.name}</span>
      <span className="text-xs text-muted-foreground">{badge.description}</span>
      <span className={cn("text-[11px] font-medium", earned ? "text-success" : "text-muted-foreground/70")}>
        {earned ? `Earned ${formatDate(earnedOn)}` : "Not yet"}
      </span>
    </li>
  );
}
