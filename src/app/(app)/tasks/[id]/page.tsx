import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, PlayIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { completeTask, deleteTask, setTaskStatus } from "@/features/tasks/actions";
import { Checklist, Comments } from "@/features/tasks/components/task-detail-parts";
import { EditTaskButton } from "@/features/tasks/components/task-form";
import { getChecklists, getTask, getTaskComments, getTaskCompletions } from "@/features/tasks/queries";
import { TASK_AREA_LABELS } from "@/features/tasks/schemas";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { formatDate, formatInstant, relativeDay } from "@/lib/dates";
import { describeRecurrence, presetValue } from "@/lib/recurrence";

export const metadata: Metadata = { title: "Task" };

const STATUS_LABELS = { todo: "To do", in_progress: "In progress", done: "Done", cancelled: "Cancelled" } as const;

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <TaskDetail params={params} />
    </Suspense>
  );
}

async function TaskDetail({ params }: { params: PageProps<"/tasks/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const task = await getTask(ctx, id);
  if (!task) notFound();
  const [checklist, comments, completions] = await Promise.all([getChecklists(ctx, [id]), getTaskComments(ctx, id), getTaskCompletions(ctx, id)]);
  const open = task.status === "todo" || task.status === "in_progress";
  const overdue = open && task.due_date !== null && task.due_date < ctx.today;
  const tz = ctx.household.timezone;
  const members = ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }));

  return (
    <div className="space-y-5">
      <PageHeader title={task.title} back={{ href: "/tasks", label: "Tasks" }} actions={<Badge variant={open ? "secondary" : "default"}>{STATUS_LABELS[task.status]}</Badge>} />

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Due</dt>
            <dd className={overdue ? "font-medium text-destructive" : "font-medium"}>
              {task.due_date ? `${relativeDay(task.due_date, ctx.today)}${overdue ? " (overdue)" : ""}` : "Anytime"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Who</dt>
            <dd className="font-medium">{memberName(ctx.members, task.assigned_user_id) ?? "Either of us"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Priority</dt>
            <dd className="font-medium capitalize">{task.priority}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Area</dt>
            <dd className="font-medium">{TASK_AREA_LABELS[task.area as keyof typeof TASK_AREA_LABELS] ?? task.area}</dd>
          </div>
          {task.recurrence_frequency ? (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Repeats</dt>
              <dd className="font-medium">{describeRecurrence(task.recurrence_frequency, task.recurrence_interval)}</dd>
            </div>
          ) : null}
        </dl>
        {task.description ? <p className="mt-4 text-sm whitespace-pre-wrap">{task.description}</p> : null}
        <p className="mt-4 text-xs text-muted-foreground">
          Added by {memberName(ctx.members, task.created_by) ?? "someone"} on {formatInstant(task.created_at, tz)}
          {task.completed_at ? ` · completed by ${memberName(ctx.members, task.completed_by) ?? "someone"} on ${formatInstant(task.completed_at, tz)}` : ""}
        </p>
      </section>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          {open ? (
            <ConfirmAction
              action={completeTask.bind(null, task.id)}
              trigger={
                <>
                  <CheckIcon data-icon="inline-start" /> Complete
                </>
              }
              title={task.recurrence_frequency ? "Complete this occurrence?" : "Mark this task done?"}
              description={task.recurrence_frequency ? "It's logged in the history and the next one is scheduled with a fresh checklist." : "It moves to recently completed."}
              confirmLabel="Complete"
              destructive={false}
              variant="default"
            />
          ) : (
            <ConfirmAction
              action={setTaskStatus.bind(null, task.id, "todo")}
              trigger={
                <>
                  <RotateCcwIcon data-icon="inline-start" /> Reopen
                </>
              }
              title="Reopen this task?"
              description="It goes back on the to-do list."
              confirmLabel="Reopen"
              destructive={false}
            />
          )}
          {task.status === "todo" ? (
            <ConfirmAction
              action={setTaskStatus.bind(null, task.id, "in_progress")}
              trigger={
                <>
                  <PlayIcon data-icon="inline-start" /> Start
                </>
              }
              title="Mark as in progress?"
              description="Lets the other person know you're on it."
              confirmLabel="Mark in progress"
              destructive={false}
            />
          ) : null}
          <EditTaskButton
            members={members}
            initial={{
              id: task.id,
              title: task.title,
              description: task.description ?? "",
              area: task.area as "home",
              assignedUserId: task.assigned_user_id ?? "",
              dueDate: task.due_date ?? "",
              priority: task.priority,
              schedule: task.recurrence_frequency ? presetValue(task.recurrence_frequency, task.recurrence_interval) : "",
            }}
          />
          {open ? (
            <ConfirmAction
              action={setTaskStatus.bind(null, task.id, "cancelled")}
              trigger={
                <>
                  <XIcon data-icon="inline-start" /> Cancel task
                </>
              }
              title="Cancel this task?"
              description="It's closed without being done."
              confirmLabel="Cancel task"
            />
          ) : null}
          <ConfirmAction
            action={deleteTask.bind(null, task.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete this task?"
            description="Its checklist, comments and history are deleted too."
            confirmLabel="Delete"
            redirectTo="/tasks"
            variant="destructive"
          />
        </div>
      ) : null}

      <section>
        <SectionHeading title="Checklist" />
        <Checklist taskId={task.id} items={checklist} canWrite={ctx.canWrite && open} />
      </section>

      <section>
        <SectionHeading title="Comments" />
        <Comments
          taskId={task.id}
          canWrite={ctx.canWrite}
          items={comments.map((c) => ({
            id: c.id,
            body: c.body,
            author: memberName(ctx.members, c.created_by) ?? "Someone",
            mine: c.created_by === ctx.userId,
            when: formatInstant(c.created_at, tz),
          }))}
        />
      </section>

      {completions.length ? (
        <section>
          <SectionHeading title="Completion history" />
          <ul className="divide-y rounded-2xl bg-card text-sm shadow-card ring-1 ring-border/80">
            {completions.map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-2.5">
                <span>
                  {formatDate(c.completed_on)} · {memberName(ctx.members, c.created_by) ?? "someone"}
                </span>
                {c.due_date ? <span className="text-muted-foreground">due {formatDate(c.due_date)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
