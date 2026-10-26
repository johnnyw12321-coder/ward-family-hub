import type { Metadata } from "next";
import { Suspense } from "react";
import { BellOffIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { QuietReminders } from "@/features/notifications/components/quiet-reminders";
import { getNotifications, getQuietReminders, getReminderStates } from "@/features/notifications/queries";
import { requireHousehold } from "@/lib/auth/context";
import { formatInstant } from "@/lib/dates";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Reminders for bills, tasks, events, goals, budgets and more. Tap the clock to change when one reminds you, snooze it or turn it off."
      />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  const ctx = await requireHousehold();
  const rows = await getNotifications(ctx);
  const [reminders, quiet] = await Promise.all([getReminderStates(ctx, rows), getQuietReminders(ctx)]);
  return (
    <div className="space-y-6">
      {rows.length ? (
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
              reminder: reminders.get(n.id),
            }))}
            today={ctx.today}
            canEditReminders={ctx.canWrite}
          />
          <p className="px-1 text-xs text-muted-foreground">
            Reminder changes apply to everyone in the household. To get these on your phone, turn on notifications in Settings.
          </p>
        </div>
      ) : (
        <EmptyState icon={BellOffIcon} title="You're all caught up" description="Reminders appear here when something is due or needs a look." />
      )}
      {quiet.length ? (
        <section>
          <SectionHeading title="Turned off or snoozed" />
          <QuietReminders items={quiet} canEdit={ctx.canWrite} />
        </section>
      ) : null}
    </div>
  );
}
