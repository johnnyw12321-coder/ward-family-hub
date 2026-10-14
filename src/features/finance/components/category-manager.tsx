"use client";

import { useState, useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, CheckIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCategory, setCategoryArchived } from "../actions";
import type { Category, CategoryKind } from "../types";

function InlineName({
  initial,
  onSubmit,
  onCancel,
  placeholder,
}: {
  initial?: string;
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
  placeholder: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-center gap-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (await onSubmit(value)) onCancel();
        });
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus maxLength={60} aria-label={placeholder} />
      <Button type="submit" size="icon" disabled={pending || !value.trim()} aria-label="Save">
        <CheckIcon />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onCancel} aria-label="Cancel">
        <XIcon />
      </Button>
    </form>
  );
}

export function CategoryManager({ categories, kind, canWrite }: { categories: Category[]; kind: CategoryKind; canWrite: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  const ofKind = categories.filter((c) => c.kind === kind);
  const parents = ofKind.filter((c) => !c.parent_id);

  const save = async (payload: { id?: string; name: string; parentId?: string }) => {
    const r = await saveCategory({ ...payload, kind });
    if (!r.ok) toast.error(r.error);
    else toast.success(r.message);
    return r.ok;
  };
  const archive = (c: Category) =>
    start(async () => {
      const r = await setCategoryArchived(c.id, !c.is_archived);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message);
    });

  const row = (c: Category, child: boolean) =>
    editing === c.id ? (
      <InlineName key={c.id} initial={c.name} placeholder="Category name" onCancel={() => setEditing(null)} onSubmit={(name) => save({ id: c.id, name, parentId: c.parent_id ?? undefined })} />
    ) : (
      <div key={c.id} className={`flex min-h-11 items-center gap-2 ${child ? "pl-5" : ""}`}>
        <span className={`flex-1 truncate ${child ? "text-sm" : "font-medium"} ${c.is_archived ? "text-muted-foreground line-through" : ""}`}>
          {c.name}
          {c.system_key ? <span className="ml-2 text-xs font-normal text-muted-foreground">built-in</span> : null}
        </span>
        {canWrite ? (
          <>
            <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing(c.id)}>
              <PencilIcon />
            </Button>
            {!c.system_key ? (
              <Button variant="ghost" size="icon-sm" aria-label={c.is_archived ? `Restore ${c.name}` : `Archive ${c.name}`} onClick={() => archive(c)}>
                {c.is_archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-3">
      {parents.map((p) => (
        <section key={p.id} className="rounded-2xl bg-card px-4 py-2 shadow-card ring-1 ring-border/80">
          {row(p, false)}
          <div className="divide-y border-t">
            {ofKind.filter((c) => c.parent_id === p.id).map((c) => row(c, true))}
          </div>
          {canWrite && !p.is_archived ? (
            editing === `new-${p.id}` ? (
              <InlineName placeholder={`New subcategory of ${p.name}`} onCancel={() => setEditing(null)} onSubmit={(name) => save({ name, parentId: p.id })} />
            ) : (
              <button type="button" onClick={() => setEditing(`new-${p.id}`)} className="flex min-h-10 items-center gap-1 pl-5 text-sm text-primary">
                <PlusIcon className="size-4" aria-hidden /> Subcategory
              </button>
            )
          ) : null}
        </section>
      ))}
      {canWrite ? (
        editing === "new-top" ? (
          <div className="rounded-2xl bg-card px-4 shadow-card ring-1 ring-border/80">
            <InlineName placeholder="New category" onCancel={() => setEditing(null)} onSubmit={(name) => save({ name })} />
          </div>
        ) : (
          <Button variant="outline" onClick={() => setEditing("new-top")}>
            <PlusIcon data-icon="inline-start" /> New {kind} category
          </Button>
        )
      ) : null}
    </div>
  );
}
