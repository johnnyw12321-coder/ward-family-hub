"use client";

import { useEffect } from "react";
import { applyAccent } from "@/components/shared/member-color";

/** Applies the signed-in member's colour as the app theme. */
export function AccentSync({ color }: { color: string }) {
  useEffect(() => {
    applyAccent(color);
  }, [color]);
  return null;
}
