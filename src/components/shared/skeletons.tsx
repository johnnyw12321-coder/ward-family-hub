import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

export function CardSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80", className)} aria-hidden>
      <Skeleton className="mb-4 h-4 w-1/3" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn("h-4", i % 2 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80" aria-hidden>
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="h-7 w-28" />
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3">
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <CardSkeleton lines={4} />
      <ListSkeleton rows={4} />
    </div>
  );
}
