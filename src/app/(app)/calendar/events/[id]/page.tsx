import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, MapPinIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { deleteEvent, setEventCompleted } from "@/features/calendar/actions";
import { EditEventButton } from "@/features/calendar/components/event-form";
import { EVENT_CATEGORY_LABELS, occurrenceInstants } from "@/features/calendar/expand";
import { getCompletions, getEvent } from "@/features/calendar/queries";
import { REMINDER_OPTIONS } from "@/features/calendar/schemas";
import { requireHousehold } from "@/lib/auth/context";
import { dayHeading, formatDate, instantToCalendarDate, instantToLocalTime, isCalendarDate } from "@/lib/dates";
import { describeRecurrence, presetValue } from "@/lib/recurrence";

export const metadata: Metadata = { title: "Event" };

export default function EventPage({ params, searchParams }: PageProps<"/calendar/events/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={5} />}>
      <EventDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EventDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/calendar/events/[id]">["params"];
  searchParams: PageProps<"/calendar/events/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const event = await getEvent(ctx, id);
  if (!event) notFound();
  const tz = ctx.household.timezone;
  const occurrence = typeof sp.date === "string" && isCalendarDate(sp.date) ? sp.date : event.start_date;
  const recurring = Boolean(event.recurrence_frequency);
  const completions = recurring ? await getCompletions(ctx, [id]) : new Set<string>();
  const completed = recurring ? completions.has(`${id}:${occurrence}`) : event.is_completed;
  const occ = occurrenceInstants(event, occurrence, tz);
  const who = event.participants.length
    ? event.participants.map((p) => ctx.members.find((m) => m.user_id === p)?.display_name).filter(Boolean).join(" & ")
    : "Everyone";
  const when = event.all_day
    ? occ.startDate === occ.endDate
      ? `${dayHeading(occ.startDate)} · all day`
      : `${formatDate(occ.startDate)} – ${formatDate(occ.endDate)} · all day`
    : occ.startDate === occ.endDate
      ? `${dayHeading(occ.startDate)} · ${instantToLocalTime(occ.start!, tz)}–${instantToLocalTime(occ.end!, tz)}`
      : `${formatDate(occ.startDate)} ${instantToLocalTime(occ.start!, tz)} – ${formatDate(occ.endDate)} ${instantToLocalTime(occ.end!, tz)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={event.title}
        back={{ href: `/calendar?date=${occurrence}`, label: "Calendar" }}
        actions={completed ? <Badge>Done</Badge> : <Badge variant="secondary">{EVENT_CATEGORY_LABELS[event.category]}</Badge>}
      />
      <section className="space-y-3 rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
        <div className="text-lg font-semibold">{when}</div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Who</dt>
            <dd className="font-medium">{who}</dd>
          </div>
          {recurring ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Repeats</dt>
              <dd className="font-medium">
                {describeRecurrence(event.recurrence_frequency!, event.recurrence_interval)}
                {event.recurrence_until ? ` until ${formatDate(event.recurrence_until)}` : ""}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Reminders</dt>
            <dd className="text-right font-medium">
              {event.reminder_minutes.length
                ? event.reminder_minutes.map((m) => REMINDER_OPTIONS.find((r) => r.value === m)?.label ?? `${m} min`).join(", ")
                : "None"}
            </dd>
          </div>
        </dl>
        {event.location ? (
          <p className="flex items-center gap-1.5 text-sm">
            <MapPinIcon className="size-4 text-muted-foreground" aria-hidden /> {event.location}
          </p>
        ) : null}
        {event.description ? <p className="text-sm whitespace-pre-wrap">{event.description}</p> : null}
      </section>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <ConfirmAction
            action={setEventCompleted.bind(null, event.id, occurrence, !completed)}
            trigger={
              completed ? (
                <>
                  <RotateCcwIcon data-icon="inline-start" /> Not done
                </>
              ) : (
                <>
                  <CheckIcon data-icon="inline-start" /> Mark done
                </>
              )
            }
            title={completed ? "Mark as not done?" : "Mark as done?"}
            description={recurring ? `This applies to ${formatDate(occurrence)} only.` : "Useful for appointments you've attended."}
            confirmLabel="Confirm"
            destructive={false}
            variant={completed ? "outline" : "default"}
          />
          <EditEventButton
            members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
            initial={{
              id: event.id,
              title: event.title,
              category: event.category,
              allDay: event.all_day,
              startDate: event.start_date,
              startTime: event.all_day ? "09:00" : instantToLocalTime(event.starts_at, tz),
              endDate: instantToCalendarDate(event.ends_at, tz),
              endTime: event.all_day ? "10:00" : instantToLocalTime(event.ends_at, tz),
              location: event.location ?? "",
              description: event.description ?? "",
              participants: event.participants,
              schedule: event.recurrence_frequency ? presetValue(event.recurrence_frequency, event.recurrence_interval) : "",
              until: event.recurrence_until ?? "",
              reminders: event.reminder_minutes,
            }}
          />
          <ConfirmAction
            action={deleteEvent.bind(null, event.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title={recurring ? "Delete the whole series?" : "Delete this event?"}
            description={recurring ? "Every occurrence of this repeating event is removed." : "This can't be undone."}
            confirmLabel="Delete"
            redirectTo={`/calendar?date=${occurrence}`}
            variant="destructive"
          />
        </div>
      ) : null}
      {recurring ? <p className="px-1 text-xs text-muted-foreground">Editing changes every occurrence of this repeating event.</p> : null}
    </div>
  );
}
