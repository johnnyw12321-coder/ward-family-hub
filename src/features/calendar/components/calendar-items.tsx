import Link from "next/link";
import { CheckIcon, FileClockIcon, FlagIcon, ListChecksIcon, ReceiptIcon, TargetIcon, TrendingUpIcon } from "lucide-react";
import { cn } from "cn";
import { EVENT_CATEGORY_LABELS, type CalendarItem, type EventCategory } from "../expand";

/** Category swatches. Every item also carries a text label, so colour is never the only cue. */
export const CATEGORY_DOT: Record<EventCategory, string> = {
  family: "bg-emerald-600",
  work: "bg-slate-500",
  medical: "bg-rose-500",
  financial: "bg-amber-500",
  school: "bg-sky-500",
  birthday: "bg-fuchsia-500",
  anniversary: "bg-pink-500",
  home_maintenance: "bg-orange-500",
  personal: "bg-teal-500",
  other: "bg-stone-400",
};

export function itemDot(item: CalendarItem): string {
  if (item.kind === "event" && item.category) return CATEGORY_DOT[item.category];
  if (item.kind === "bill") return "bg-amber-600";
  if (item.kind === "income") return "bg-emerald-500";
  if (item.kind === "task") return "bg-slate-400";
  if (item.kind === "document") return "bg-rose-400";
  return "bg-primary";
}

function KindIcon({ item }: { item: CalendarItem }) {
  const cls = "size-4";
  switch (item.kind) {
    case "bill":
      return <ReceiptIcon className={cls} aria-hidden />;
    case "income":
      return <TrendingUpIcon className={cls} aria-hidden />;
    case "task":
      return <ListChecksIcon className={cls} aria-hidden />;
    case "goal":
      return <TargetIcon className={cls} aria-hidden />;
    case "milestone":
      return <FlagIcon className={cls} aria-hidden />;
    case "document":
      return <FileClockIcon className={cls} aria-hidden />;
    default:
      return <span className={cn("size-2.5 rounded-full", itemDot(item))} aria-hidden />;
  }
}

function kindLabel(item: CalendarItem): string {
  switch (item.kind) {
    case "event":
      return item.category ? EVENT_CATEGORY_LABELS[item.category] : "Event";
    case "bill":
      return "Bill due";
    case "income":
      return "Income expected";
    case "task":
      return "Task due";
    case "goal":
      return "Goal deadline";
    case "milestone":
      return "Milestone due";
    case "document":
      return "Document expiry";
  }
}

export function CalendarItemRow({ item, names }: { item: CalendarItem; names: Record<string, string> }) {
  const who = item.participants?.length ? item.participants.map((p) => names[p]).filter(Boolean).join(" & ") : null;
  return (
    <li>
      <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60">
        <div className="w-12 shrink-0 text-xs leading-tight text-muted-foreground tabular">
          {item.time ? (
            <>
              <div className="font-medium text-foreground">{item.time}</div>
              {item.endTime ? <div>{item.endTime}</div> : null}
            </>
          ) : (
            "All day"
          )}
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <KindIcon item={item} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-center gap-1.5 truncate font-medium", item.completed && "text-muted-foreground line-through")}>
            {item.completed ? <CheckIcon className="size-3.5 shrink-0 text-success" aria-label="Done" /> : null}
            {item.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[kindLabel(item), item.span ? `day ${item.span.day} of ${item.span.of}` : null, who, item.location].filter(Boolean).join(" · ")}
          </div>
        </div>
      </Link>
    </li>
  );
}
