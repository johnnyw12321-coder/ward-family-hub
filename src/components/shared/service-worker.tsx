"use client";

import { useEffect, useSyncExternalStore } from "react";
import { WifiOffIcon } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
}

/** Registers the service worker in production and shows an offline banner. */
export function ServiceWorkerRegistration() {
  const offline = useIsOffline();

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Registration failure only disables the offline page; the app still works.
      });
    }
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-foreground px-4 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] text-sm text-background"
    >
      <WifiOffIcon className="size-4" aria-hidden />
      You&apos;re offline. Changes can&apos;t be saved until you reconnect.
    </div>
  );
}
