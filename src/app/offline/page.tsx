import type { Metadata } from "next";
import { WifiOffIcon } from "lucide-react";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline" };

/**
 * Static fallback served by the service worker when a page can't be reached.
 * It contains no household data.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOffIcon className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ward Family Hub needs a connection to load your household information. For privacy, financial data is not
          stored on this device.
        </p>
      </div>
      <RetryButton />
    </main>
  );
}
