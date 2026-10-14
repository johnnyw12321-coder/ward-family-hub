"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button size="lg" onClick={() => window.location.assign("/")}>
      <RefreshCwIcon data-icon="inline-start" />
      Try again
    </Button>
  );
}
