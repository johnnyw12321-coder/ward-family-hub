"use client";

import { TrophyIcon } from "lucide-react";
import { toast } from "sonner";
import type { Badge } from "../calc/achievements";

/** Toast each newly earned badge (the dashboard also shows a celebration until it's dismissed). */
export function celebrate(badges: Badge[] | undefined) {
  for (const b of badges ?? []) {
    toast.success(`Badge earned: ${b.name}`, {
      description: b.description,
      icon: <TrophyIcon className="size-4 text-warning" aria-hidden />,
      duration: 6000,
    });
  }
}

/** Standard handling for a tracking action result: error toast, or success + badges. */
export function report(r: { ok: true; data: { badges: Badge[] }; message?: string } | { ok: false; error: string }, quiet = false) {
  if (!r.ok) {
    toast.error(r.error);
    return false;
  }
  if (!quiet && r.message) toast.success(r.message);
  celebrate(r.data.badges);
  return true;
}
