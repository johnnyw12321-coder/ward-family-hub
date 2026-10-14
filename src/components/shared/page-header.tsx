import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { cn } from "cn";

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-5 flex flex-col gap-1 pt-2", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-lg py-1 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance lg:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionHeading({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2 px-1", className)}>
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {action}
    </div>
  );
}
