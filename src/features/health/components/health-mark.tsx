import { cn } from "cn";

/** Ward Health's mark: the Ward Hub tile with a heartbeat instead of a house. */
export function HealthMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("shrink-0 rounded-[13px]", className)} aria-hidden>
      <rect width="48" height="48" rx="13" className="fill-primary" />
      <path
        d="M24 35.5s-11-6.4-11-14.2A6.3 6.3 0 0 1 24 17.4a6.3 6.3 0 0 1 11 3.9c0 7.8-11 14.2-11 14.2Z"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M15.5 25h5l2-3.5 3 6 2-2.5h5" fill="none" className="stroke-primary-foreground" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
