"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fillLinkPreviews } from "../actions";

/**
 * When a list has links that were never previewed, fetch their previews in
 * the background and refresh the page once they're in.
 */
export function PreviewFiller({ list, pending }: { list: string; pending: number }) {
  const router = useRouter();
  const started = useRef(false);
  const [working, setWorking] = useState(pending > 0);
  useEffect(() => {
    if (!pending || started.current) return;
    started.current = true;
    void fillLinkPreviews(list).then((r) => {
      setWorking(false);
      if (r.ok && r.data.updated) router.refresh();
    });
  }, [list, pending, router]);
  if (!working) return null;
  return (
    <p role="status" className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
      <Spinner className="size-3.5" /> Getting previews for {pending === 1 ? "1 link" : `${pending} links`}…
    </p>
  );
}

/** Ask a shop for its preview again (it may have been down, or blocking us). */
export function RetryPreviewButton({ list, itemId }: { list: string; itemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await fillLinkPreviews(list, [itemId]);
          if (!r.ok) toast.error(r.error);
          else if (r.data.updated) {
            toast.success("Preview added");
            router.refresh();
          } else toast.error("That shop still isn't sharing a preview. Add a photo or screenshot instead.");
        })
      }
    >
      {pending ? <Spinner className="size-3" /> : <RefreshCwIcon className="size-3" aria-hidden />} Try again
    </Button>
  );
}
