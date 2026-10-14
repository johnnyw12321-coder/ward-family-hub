"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, BellIcon, CheckCheckIcon, OctagonAlertIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { dismissNotification, markAllNotificationsRead, markNotificationRead } from "../actions";

type Item = { id: string; severity: "info" | "warning" | "critical"; title: string; body: string | null; link_path: string | null; read: boolean; when: string };

export function NotificationList({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="space-y-3">
      {unread ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await markAllNotificationsRead();
                if (!r.ok) toast.error(r.error);
              })
            }
          >
            <CheckCheckIcon data-icon="inline-start" /> Mark all read
          </Button>
        </div>
      ) : null}
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
        {items.map((n) => {
          const Icon = n.severity === "critical" ? OctagonAlertIcon : n.severity === "warning" ? AlertTriangleIcon : BellIcon;
          return (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read && "bg-accent/40")}>
              <span
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                  n.severity === "critical" ? "bg-danger-soft text-destructive" : n.severity === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() =>
                  start(async () => {
                    if (!n.read) await markNotificationRead(n.id);
                    if (n.link_path) router.push(n.link_path);
                  })
                }
              >
                <span className={cn("block text-sm", !n.read ? "font-semibold" : "font-medium")}>
                  {n.severity !== "info" ? <span className="sr-only">{n.severity === "critical" ? "Urgent: " : "Attention: "}</span> : null}
                  {n.title}
                </span>
                {n.body ? <span className="block text-xs text-muted-foreground">{n.body}</span> : null}
                <span className="block text-[11px] text-muted-foreground">{n.when}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Dismiss: ${n.title}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await dismissNotification(n.id);
                    if (!r.ok) toast.error(r.error);
                  })
                }
              >
                <XIcon />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
