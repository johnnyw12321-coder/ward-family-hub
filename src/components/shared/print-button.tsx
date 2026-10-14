"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <PrinterIcon data-icon="inline-start" /> {label}
    </Button>
  );
}
