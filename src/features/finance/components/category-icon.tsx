import {
  ArrowLeftRightIcon,
  BriefcaseIcon,
  CarIcon,
  CirclePlusIcon,
  GiftIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  HouseIcon,
  LandmarkIcon,
  PalmtreeIcon,
  PercentIcon,
  PiggyBankIcon,
  PlugIcon,
  ScaleIcon,
  ShapesIcon,
  ShieldIcon,
  ShoppingBasketIcon,
  StoreIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

const ICONS: Record<string, LucideIcon> = {
  house: HouseIcon,
  "shopping-basket": ShoppingBasketIcon,
  car: CarIcon,
  plug: PlugIcon,
  users: UsersIcon,
  shield: ShieldIcon,
  palmtree: PalmtreeIcon,
  "heart-pulse": HeartPulseIcon,
  "graduation-cap": GraduationCapIcon,
  landmark: LandmarkIcon,
  shapes: ShapesIcon,
  briefcase: BriefcaseIcon,
  store: StoreIcon,
  percent: PercentIcon,
  gift: GiftIcon,
  "piggy-bank": PiggyBankIcon,
  "circle-plus": CirclePlusIcon,
};

const TONES: Record<string, string> = {
  sage: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  clay: "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  stone: "bg-stone-100 text-stone-700 dark:bg-stone-800/70 dark:text-stone-300",
};

export function CategoryIcon({
  icon,
  color,
  kind,
  className,
}: {
  icon?: string | null;
  color?: string | null;
  kind?: "transfer" | "adjustment" | null;
  className?: string;
}) {
  const Icon = kind === "transfer" ? ArrowLeftRightIcon : kind === "adjustment" ? ScaleIcon : (ICONS[icon ?? ""] ?? ShapesIcon);
  const tone = kind ? TONES.slate : (TONES[color ?? ""] ?? TONES.stone);
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone, className)} aria-hidden>
      <Icon className="size-[18px]" />
    </span>
  );
}
