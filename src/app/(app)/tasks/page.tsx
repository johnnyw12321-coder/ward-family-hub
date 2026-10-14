import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListChecksIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { NewTaskButton } from "@/features/tasks/components/task-form";
import { QuickAddTask, TaskRow, type TaskListItem } from "@/features/tasks/components/task-items";
import { TasksTabs } from "@/features/tasks/components/tasks-tabs";
import { getChecklists, getOpenTasks, getRecentlyDone, type TaskRow as Task } from "@/features/tasks/queries";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { addDays } from "@/lib/dates";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <div>
      <PageHeader title="Tasks & shopping" back={{ href: "/more", label: "More" }} />
      <TasksTabs active="tasks" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <TasksView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TasksView({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const show = (await searchParams).show === "mine" ? "mine" : "all";
  const ctx = await requireHousehold();
  const [open, done] = await Promise.all([getOpenTasks(ctx), getRecentlyDone(ctx, 8)]);
  const checklists = await getChecklists(ctx, open.map((t) => t.id));
  const { today } = ctx;
  const members = ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }));

  const visible = show === "mine" ? open.filter((t) => t.assigned_user_id === ctx.userId || t.assigned_user_id === null) : open;
  const toItem = (t: Task): TaskListItem => {
    const items = checklists.filter((c) => c.task_id === t.id);
    return {
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      status: t.status,
      recurring: Boolean(t.recurrence_frequency),
      assignee: memberName(ctx.members, t.assigned_user_id),
      checklist: { done: items.filter((i) => i.is_done).length, total: items.length },
    };
  };
  const week = addDays(today, 7);
  const groups: { title: string; tasks: Task[] }[] = [
    { title: "Overdue", tasks: visible.filter((t) => t.due_date && t.due_date < today) },
    { title: "Today", tasks: visible.filter((t) => t.due_date === today) },
    { title: "Next 7 days", tasks: visible.filter((t) => t.due_date && t.due_date > today && t.due_date <= week) },
    { title: "Later", tasks: visible.filter((t) => t.due_date && t.due_date > week) },
    { title: "Anytime", tasks: visible.filter((t) => !t.due_date) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-card p-1 ring-1 ring-border">
          {(["all", "mine"] as const).map((s) => (
            <Link
              key={s}
              href={s === "all" ? "/tasks" : "/tasks?show=mine"}
              aria-current={show === s ? "page" : undefined}
              className={cn("rounded-full px-3 py-1.5 text-sm font-medium", show === s ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {s === "all" ? "Everyone" : "Mine & shared"}
            </Link>
          ))}
        </div>
        {ctx.canWrite ? <NewTaskButton members={members} /> : null}
      </div>
      {ctx.canWrite ? <QuickAddTask members={members} meId={ctx.userId} today={today} /> : null}

      {visible.length ? (
        groups
          .filter((g) => g.tasks.length)
          .map((g) => (
            <section key={g.title}>
              <SectionHeading title={`${g.title} · ${g.tasks.length}`} />
              <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={toItem(t)} today={today} canWrite={ctx.canWrite} />
                ))}
              </ul>
            </section>
          ))
      ) : (
        <EmptyState icon={ListChecksIcon} title="All clear" description="Nothing on the list. Add chores, errands or anything you don't want to forget." />
      )}

      {done.length ? (
        <section>
          <SectionHeading title="Recently completed" />
          <ul className="divide-y rounded-2xl bg-card opacity-80 shadow-card ring-1 ring-border/80">
            {done.map((t) => (
              <TaskRow key={t.id} task={toItem(t)} today={today} canWrite={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
