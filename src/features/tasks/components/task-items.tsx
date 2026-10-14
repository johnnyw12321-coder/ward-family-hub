"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, ListChecksIcon, PlusIcon, RepeatIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, relativeDay } from "@/lib/dates";
import { completeTask, quickAddTask } from "../actions";

export type TaskListItem = {
  id: string;
  title: string;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: string;
  recurring: boolean;
  assignee: string | null;
  checklist: { done: number; total: number };
};

export function TaskRow({ task, today, canWrite }: { task: TaskListItem; today: string; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(false);
  const overdue = task.due_date !== null && task.due_date < today;
  const done = task.status === "done" || optimisticDone;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        disabled={!canWrite || pending || task.status === "done"}
        aria-label={done ? `${task.title} is done` : `Complete ${task.title}`}
        onClick={() =>
          start(async () => {
            setOptimisticDone(true);
            const r = await completeTask(task.id);
            if (!r.ok) toast.error(r.error);
            else toast.success(r.message);
          })
        }
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done ? "border-success bg-success text-white" : task.priority === "high" ? "border-destructive/60 hover:bg-danger-soft" : "border-input hover:border-primary hover:bg-accent",
        )}
      >
        {pending ? <Spinner className="size-4" /> : done ? <CheckIcon className="size-5" /> : null}
      </button>
      <Link href={`/tasks/${task.id}`} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
        <span className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {task.due_date ? (
            <span className={cn(overdue && !done && "font-medium text-destructive")}>
              {overdue ? `Overdue · ${formatDate(task.due_date)}` : relativeDay(task.due_date, today)}
            </span>
          ) : null}
          {task.assignee ? <span>{task.assignee}</span> : null}
          {task.recurring ? (
            <span className="inline-flex items-center gap-0.5">
              <RepeatIcon className="size-3" aria-hidden /> repeats
            </span>
          ) : null}
          {task.checklist.total ? (
            <span className="inline-flex items-center gap-0.5">
              <ListChecksIcon className="size-3" aria-hidden /> {task.checklist.done}/{task.checklist.total}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function QuickAddTask({ members, meId, today }: { members: { user_id: string; display_name: string }[]; meId: string; today: string }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-border/80"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await quickAddTask({ title, dueDate: due, assignedUserId: who });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            setTitle("");
            setDue("");
          }
        });
      }}
    >
      <div className="flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="New task" maxLength={200} />
        <Button type="submit" size="icon-lg" disabled={pending || !title.trim()} aria-label="Add task">
          {pending ? <Spinner /> : <PlusIcon />}
        </Button>
      </div>
      {title ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <NativeSelect value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assign to">
            <option value="">Either of us</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user_id === meId ? "Me" : m.display_name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </form>
  );
}
