import type { Metadata } from "next";
import { Suspense } from "react";
import { BellOffIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { getNotifications } from "@/features/notifications/queries";
import { requireHousehold } from "@/lib/auth/context";
import { formatInstant } from "@/lib/dates";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="Bills, tasks, events, goals and budgets that need attention." />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  const ctx = await requireHousehold();
  const rows = await getNotifications(ctx);
  if (!rows.length) {
    return <EmptyState icon={BellOffIcon} title="You're all caught up" description="Reminders appear here when something is due or needs a look." />;
  }
  return (
    <div className="space-y-3">
      <NotificationList
        items={rows.map((n) => ({
          id: n.id,
          severity: n.severity,
          title: n.title,
          body: n.body,
          link_path: n.link_path,
          read: Boolean(n.read_at),
          when: formatInstant(n.created_at, ctx.household.timezone),
        }))}
      />
      <p className="px-1 text-xs text-muted-foreground">
        Notifications are shown in the app only. Email and phone push alerts are not set up yet.
      </p>
    </div>
  );
}
