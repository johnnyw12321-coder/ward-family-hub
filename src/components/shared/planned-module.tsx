import type { LucideIcon } from "lucide-react";
import { ConstructionIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

/**
 * Honest placeholder for a module that is designed but not built yet.
 * It explains what is coming and offers no controls that pretend to work.
 */
export function PlannedModule({
  title,
  icon: Icon,
  phase,
  summary,
  features,
  fromMore = true,
}: {
  fromMore?: boolean;
  title: string;
  icon: LucideIcon;
  phase: number;
  summary: string;
  features: string[];
}) {
  return (
    <div>
      <PageHeader title={title} back={fromMore ? { href: "/more", label: "More" } : undefined} />
      <div className="rounded-3xl bg-card p-6 shadow-card ring-1 ring-border/80">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Icon className="size-6" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-warning uppercase">
              <ConstructionIcon className="size-3.5" aria-hidden /> Planned · Phase {phase}
            </div>
            <p className="text-sm text-muted-foreground">Not available yet — nothing is stored here.</p>
          </div>
        </div>
        <p className="mb-4">{summary}</p>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">What it will include</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
