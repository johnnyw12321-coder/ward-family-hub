import { cn } from "cn";

/** House mark with a leaf-shaped door: home + growth. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("shrink-0", className)} aria-hidden>
      <rect width="48" height="48" rx="13" className="fill-primary" />
      <path
        d="M12 22.5 24 13l12 9.5V34a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V22.5Z"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M24 36v-6.5c0-3 2-5.2 5-5.5 0 3-2 5.6-5 6" fill="none" className="stroke-primary-foreground" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
