"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { addChecklistItem, addComment, deleteChecklistItem, deleteComment, toggleChecklistItem } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void, quiet = false) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (!quiet) toast.success(r.message);
        after?.();
      }
    });
  return { pending, run };
}

export function Checklist({ taskId, items, canWrite }: { taskId: string; items: { id: string; title: string; is_done: boolean }[]; canWrite: boolean }) {
  const { pending, run } = useRun();
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-2">
      {items.length ? (
        <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-1.5">
              <button
                type="button"
                disabled={!canWrite || pending}
                onClick={() => run(() => toggleChecklistItem(i.id, !i.is_done), undefined, true)}
                aria-label={i.is_done ? `Uncheck ${i.title}` : `Check ${i.title}`}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border-2",
                  i.is_done ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {i.is_done ? <CheckIcon className="size-4" /> : null}
              </button>
              <span className={cn("flex-1 text-sm", i.is_done && "text-muted-foreground line-through")}>{i.title}</span>
              {canWrite ? (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${i.title}`} disabled={pending} onClick={() => run(() => deleteChecklistItem(i.id), undefined, true)}>
                  <Trash2Icon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canWrite ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addChecklistItem(taskId, title), () => setTitle(""), true);
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a step" aria-label="New checklist item" maxLength={200} />
          <Button type="submit" variant="secondary" disabled={pending || !title.trim()}>
            {pending ? <Spinner /> : <PlusIcon data-icon="inline-start" />} Add
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function Comments({
  taskId,
  items,
  canWrite,
}: {
  taskId: string;
  items: { id: string; body: string; author: string; mine: boolean; when: string }[];
  canWrite: boolean;
}) {
  const { pending, run } = useRun();
  const [body, setBody] = useState("");
  return (
    <div className="space-y-3">
      {items.length ? (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", c.mine ? "ml-auto bg-accent text-accent-foreground" : "bg-card ring-1 ring-border/80")}>
              <div className="whitespace-pre-wrap">{c.body}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] opacity-70">
                <span>
                  {c.author} · {c.when}
                </span>
                {c.mine ? (
                  <button type="button" className="underline" disabled={pending} onClick={() => run(() => deleteComment(c.id), undefined, true)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {canWrite ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addComment(taskId, body), () => setBody(""), true);
          }}
        >
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Leave a note for each other" aria-label="New comment" maxLength={2000} />
          <Button type="submit" size="icon-lg" disabled={pending || !body.trim()} aria-label="Post comment">
            {pending ? <Spinner /> : <SendIcon />}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
