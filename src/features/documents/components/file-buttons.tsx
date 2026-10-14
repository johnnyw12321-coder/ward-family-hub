"use client";

import { useTransition } from "react";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getFileLink } from "../actions";

/**
 * Fetches a fresh 60-second signed link on demand, so links are never
 * embedded in pages or left lying around in history.
 */
export function FileButton({ fileId, mode, label, size = "default", variant = "outline" }: { fileId: string; mode: "view" | "download"; label?: string; size?: "default" | "sm" | "lg"; variant?: "outline" | "default" | "ghost" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() => {
        // Open the window synchronously (popup blockers), then point it at the link.
        const win = mode === "view" ? window.open("about:blank", "_blank") : null;
        if (win) win.opener = null;
        start(async () => {
          const r = await getFileLink(fileId, mode);
          if (!r.ok) {
            win?.close();
            toast.error(r.error);
            return;
          }
          if (win) win.location.href = r.data.url;
          else window.location.assign(r.data.url);
        });
      }}
    >
      {pending ? <Spinner /> : mode === "view" ? <ExternalLinkIcon data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
      {label ?? (mode === "view" ? "Open" : "Download")}
    </Button>
  );
}
