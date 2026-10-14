"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { RECURRENCE_PRESETS } from "@/lib/recurrence";
import { saveTask } from "../actions";
import { TASK_AREAS, TASK_AREA_LABELS, taskSchema, type TaskInput } from "../schemas";

type Props = {
  members: { user_id: string; display_name: string }[];
  initial?: Partial<TaskInput>;
  onSaved: (id: string) => void;
};

export function TaskForm({ members, initial, onSaved }: Props) {
  const [pending, start] = useTransition();
  const form = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", description: "", area: "home", assignedUserId: "", dueDate: "", priority: "medium", schedule: "", ...initial },
  });
  const { register, formState } = form;
  const err = formState.errors;
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveTask(v);
          if (!r.ok) {
            for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof TaskInput, { message: m });
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
          <FieldLabel htmlFor="t-title">Task</FieldLabel>
          <Input id="t-title" placeholder="e.g. Service the AC units" autoFocus={!initial?.id} {...register("title")} />
          <FieldError>{err.title?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="t-assignee">Who</FieldLabel>
            <NativeSelect id="t-assignee" {...register("assignedUserId")}>
              <option value="">Either of us</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={Boolean(err.dueDate)}>
            <FieldLabel htmlFor="t-due">Due</FieldLabel>
            <Input id="t-due" type="date" {...register("dueDate")} />
            <FieldError>{err.dueDate?.message}</FieldError>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="t-priority">Priority</FieldLabel>
            <NativeSelect id="t-priority" {...register("priority")}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="t-area">Area</FieldLabel>
            <NativeSelect id="t-area" {...register("area")}>
              {TASK_AREAS.map((a) => (
                <option key={a} value={a}>
                  {TASK_AREA_LABELS[a]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="t-repeat">Repeats</FieldLabel>
            <NativeSelect id="t-repeat" {...register("schedule")}>
              <option value="">Never</option>
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="t-desc">Details (optional)</FieldLabel>
          <Textarea id="t-desc" rows={3} {...register("description")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {initial?.id ? "Save changes" : "Add task"}
      </Button>
    </form>
  );
}

export function NewTaskButton({ members }: { members: Props["members"] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" /> Task
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="New task">
        {open ? <TaskForm members={members} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

export function EditTaskButton({ members, initial }: { members: Props["members"]; initial: Partial<TaskInput> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" /> Edit
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Edit task">
        {open ? <TaskForm members={members} initial={initial} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

/** Full-page form used by the quick-add menu. */
export function NewTaskPageForm({ members }: { members: Props["members"] }) {
  const router = useRouter();
  return <TaskForm members={members} onSaved={(id) => router.push(`/tasks/${id}`)} />;
}
