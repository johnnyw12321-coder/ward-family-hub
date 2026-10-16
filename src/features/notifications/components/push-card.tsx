"use client";

import { useEffect, useState, useTransition } from "react";
import { BellIcon, BellOffIcon, SendIcon, ShareIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { removePushSubscription, savePushSubscription, sendTestPush } from "../push-actions";

type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "not-configured";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // In production the app registers the worker on load; make sure it exists either way.
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

async function detect(publicKey: string | null): Promise<State> {
  if (!publicKey) return "not-configured";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isInstalled() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? "on" : "off";
}

/**
 * Turn reminders on or off for this phone. Each phone is separate, so you
 * can have notifications on your phone but not on a shared tablet.
 */
export function PushCard({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void detect(publicKey).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const turnOn = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          toast.error("Notifications weren't allowed.");
          return;
        }
        const reg = await registration();
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) }));
        const r = await savePushSubscription(sub.toJSON(), navigator.userAgent);
        if (!r.ok) {
          await sub.unsubscribe();
          toast.error(r.error);
          return;
        }
        setState("on");
        toast.success(r.message ?? "Notifications are on");
      } catch {
        toast.error("This phone couldn't turn on notifications. Try again, or check the browser's settings.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Notifications are off for this phone");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      if (r.ok) toast.success(r.message ?? "Test sent");
      else toast.error(r.error);
    });

  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
          {state === "on" ? <BellIcon className="size-5" /> : <BellOffIcon className="size-5" />}
        </span>
        <div className="min-w-0">
          <h3 className="font-medium">Notifications on this phone</h3>
          <p className="text-sm text-muted-foreground">
            {state === "checking"
              ? "Checking…"
              : state === "on"
                ? "On. You'll get a reminder around 7 a.m. when bills, tasks, events or budgets need attention."
                : state === "off"
                  ? "Get a reminder on this phone around 7 a.m. when something needs attention. Each phone is set separately."
                  : state === "ios-install"
                    ? "On iPhone, add Ward Hub to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and come back here."
                    : state === "denied"
                      ? "Notifications are blocked for Ward Hub. Allow them in your phone's settings for this app or site, then come back."
                      : state === "not-configured"
                        ? "Notifications aren't set up on the server yet."
                        : "This browser can't receive notifications. Try Chrome on Android, or Ward Hub from the Home Screen on iPhone."}
          </p>
        </div>
      </div>
      {state === "off" ? (
        <Button onClick={turnOn} disabled={pending} className="w-full sm:w-auto">
          {pending ? <Spinner /> : <BellIcon aria-hidden />} Turn on notifications
        </Button>
      ) : state === "on" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={test} disabled={pending}>
            {pending ? <Spinner /> : <SendIcon aria-hidden />} Send a test
          </Button>
          <Button variant="ghost" onClick={turnOff} disabled={pending}>
            <BellOffIcon aria-hidden /> Turn off
          </Button>
        </div>
      ) : state === "ios-install" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShareIcon className="size-3.5" aria-hidden /> Needs iOS 16.4 or newer.
        </p>
      ) : null}
    </div>
  );
}
