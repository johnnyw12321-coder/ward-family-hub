import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("rounded-2xl border border-dashed bg-card/50 py-10", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-accent text-accent-foreground">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
