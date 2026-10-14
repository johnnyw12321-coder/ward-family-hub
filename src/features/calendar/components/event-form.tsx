"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RECURRENCE_PRESETS } from "@/lib/recurrence";
import { saveEvent } from "../actions";
import { EVENT_CATEGORY_LABELS } from "../expand";
import { EVENT_CATEGORIES, REMINDER_OPTIONS, eventSchema, type EventInput } from "../schemas";

export type AboutOptions = { familyMembers: { id: string; name: string }[]; assets: { id: string; name: string }[] };

type Props = {
  members: { user_id: string; display_name: string }[];
  about: AboutOptions;
  defaultDate: string;
  initial?: Partial<EventInput>;
  onSaved: (id: string) => void;
};

export function EventForm({ members, about, defaultDate, initial, onSaved }: Props) {
  const [pending, start] = useTransition();
  const form = useForm<EventInput>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      category: "family",
      allDay: false,
      startDate: defaultDate,
      startTime: "09:00",
      endDate: defaultDate,
      endTime: "10:00",
      location: "",
      description: "",
      participants: [],
      schedule: "",
      until: "",
      reminders: [1440],
      familyMemberId: "",
      assetId: "",
      ...initial,
    },
  });
  const { register, control, formState, setValue, getValues } = form;
  const err = formState.errors;
  const allDay = useWatch({ control, name: "allDay" });
  const schedule = useWatch({ control, name: "schedule" });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveEvent(v);
          if (!r.ok) {
            for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof EventInput, { message: m });
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          onSaved(r.data.id);
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.title)}>
          <FieldLabel htmlFor="ev-title">Event</FieldLabel>
          <Input id="ev-title" placeholder="e.g. Paediatrician check-up" autoFocus={!initial?.id} {...register("title")} />
          <FieldError>{err.title?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="ev-cat">Category</FieldLabel>
            <NativeSelect id="ev-cat" {...register("category")}>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EVENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Controller
            control={control}
            name="allDay"
            render={({ field }) => (
              <Field orientation="horizontal" className="mt-6 justify-between rounded-xl bg-muted/60 px-3">
                <FieldLabel htmlFor="ev-allday" className="font-normal">
                  All day
                </FieldLabel>
                <Switch id="ev-allday" checked={field.value} onCheckedChange={field.onChange} />
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.startDate)}>
            <FieldLabel htmlFor="ev-sd">Starts</FieldLabel>
            <Input
              id="ev-sd"
              type="date"
              {...register("startDate", {
                onChange: (e) => {
                  if (getValues("endDate") < e.target.value) setValue("endDate", e.target.value);
                },
              })}
            />
          </Field>
          {!allDay ? (
            <Field data-invalid={Boolean(err.startTime)}>
              <FieldLabel htmlFor="ev-st">Time</FieldLabel>
              <Input id="ev-st" type="time" {...register("startTime")} />
              <FieldError>{err.startTime?.message}</FieldError>
            </Field>
          ) : null}
          <Field data-invalid={Boolean(err.endDate)}>
            <FieldLabel htmlFor="ev-ed">Ends</FieldLabel>
            <Input id="ev-ed" type="date" {...register("endDate")} />
            <FieldError>{err.endDate?.message}</FieldError>
          </Field>
          {!allDay ? (
            <Field data-invalid={Boolean(err.endTime)}>
              <FieldLabel htmlFor="ev-et">Time</FieldLabel>
              <Input id="ev-et" type="time" {...register("endTime")} />
              <FieldError>{err.endTime?.message}</FieldError>
            </Field>
          ) : null}
        </div>

        {members.length > 1 ? (
          <Controller
            control={control}
            name="participants"
            render={({ field }) => (
              <Field>
                <FieldLabel id="ev-people">Who&apos;s involved</FieldLabel>
                <div role="group" aria-labelledby="ev-people" className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const on = field.value.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => field.onChange(on ? field.value.filter((id) => id !== m.user_id) : [...field.value, m.user_id])}
                        className={cn("h-10 rounded-full border px-4 text-sm font-medium", on ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground")}
                      >
                        {m.display_name}
                      </button>
                    );
                  })}
                </div>
                <FieldDescription>Leave both unselected if it&apos;s for the whole family.</FieldDescription>
              </Field>
            )}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="ev-repeat">Repeats</FieldLabel>
            <NativeSelect id="ev-repeat" {...register("schedule")}>
              <option value="">Doesn&apos;t repeat</option>
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {schedule ? (
            <Field data-invalid={Boolean(err.until)}>
              <FieldLabel htmlFor="ev-until">Until (optional)</FieldLabel>
              <Input id="ev-until" type="date" {...register("until")} />
              <FieldError>{err.until?.message}</FieldError>
            </Field>
          ) : null}
        </div>

        <Controller
          control={control}
          name="reminders"
          render={({ field }) => (
            <Field>
              <FieldLabel id="ev-rem">Reminders</FieldLabel>
              <div role="group" aria-labelledby="ev-rem" className="flex flex-wrap gap-2">
                {REMINDER_OPTIONS.map((r) => {
                  const on = field.value.includes(r.value);
                  return (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== r.value) : [...field.value, r.value])}
                      className={cn("h-9 rounded-full border px-3 text-xs font-medium", on ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground")}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <FieldDescription>
                In-app notifications start on the day of the earliest reminder. Phone push alerts aren&apos;t set up yet.
              </FieldDescription>
            </Field>
          )}
        />

        {about.familyMembers.length || about.assets.length ? (
          <div className="grid grid-cols-2 gap-3">
            {about.familyMembers.length ? (
              <Field>
                <FieldLabel htmlFor="ev-about">About</FieldLabel>
                <NativeSelect id="ev-about" {...register("familyMemberId")}>
                  <option value="">No one in particular</option>
                  {about.familyMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            {about.assets.length ? (
              <Field>
                <FieldLabel htmlFor="ev-asset">Home or vehicle</FieldLabel>
                <NativeSelect id="ev-asset" {...register("assetId")}>
                  <option value="">None</option>
                  {about.assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
          </div>
        ) : null}

        <Field>
          <FieldLabel htmlFor="ev-loc">Location</FieldLabel>
          <Input id="ev-loc" placeholder="Optional" {...register("location")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ev-notes">Notes</FieldLabel>
          <Textarea id="ev-notes" rows={3} {...register("description")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {initial?.id ? "Save changes" : "Add event"}
      </Button>
    </form>
  );
}

export function NewEventButton({ members, about, defaultDate }: { members: Props["members"]; about: AboutOptions; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" /> Event
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="New event">
        {open ? <EventForm members={members} about={about} defaultDate={defaultDate} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

export function EditEventButton({ members, about, initial }: { members: Props["members"]; about: AboutOptions; initial: Partial<EventInput> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" /> Edit
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Edit event">
        {open ? <EventForm members={members} about={about} defaultDate={initial.startDate ?? ""} initial={initial} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

export function NewEventPageForm({
  members,
  about,
  defaultDate,
  initial,
}: {
  members: Props["members"];
  about: AboutOptions;
  defaultDate: string;
  initial?: Partial<EventInput>;
}) {
  const router = useRouter();
  return <EventForm members={members} about={about} defaultDate={defaultDate} initial={initial} onSaved={() => router.push(`/calendar?date=${defaultDate}`)} />;
}
