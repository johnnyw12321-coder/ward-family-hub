"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, ListRestartIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { currencySymbol, formatMoney, minorToInput } from "@/lib/money";
import {
  bulkShoppingAction,
  copyShoppingList,
  createShoppingList,
  deleteShoppingItem,
  saveShoppingItem,
  toggleShoppingItem,
} from "../actions";

export function NewListButton({ templates }: { templates: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" /> List
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="New shopping list">
        <form
          className="space-y-4 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = from ? await copyShoppingList(from, name) : await createShoppingList(name);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success(r.message);
              setOpen(false);
              router.push(`/shopping/${r.data.id}`);
            });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PriceSmart run" aria-label="List name" autoFocus maxLength={80} />
          {templates.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Start from</div>
              <div className="flex flex-wrap gap-2">
                {[{ id: "", name: "Empty list" }, ...templates].map((t) => (
                  <button
                    key={t.id || "empty"}
                    type="button"
                    onClick={() => setFrom(t.id)}
                    aria-pressed={from === t.id}
                    className={cn("h-10 rounded-full border px-4 text-sm", from === t.id ? "border-primary bg-accent text-accent-foreground" : "bg-card")}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending || !name.trim()}>
            {pending ? <Spinner /> : null} Create list
          </Button>
        </form>
      </ResponsiveModal>
    </>
  );
}

type Item = { id: string; name: string; quantity: string | null; estimated_price_minor: number | null; is_checked: boolean };

function ItemRow({ item, canWrite, currency, onEdit }: { item: Item; canWrite: boolean; currency: string; onEdit: (i: Item) => void }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useOptimistic(item.is_checked);
  return (
    <li className="flex items-center gap-2 px-2 py-1">
      <button
        type="button"
        disabled={!canWrite}
        aria-label={checked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
        onClick={() =>
          start(async () => {
            setChecked(!checked);
            const r = await toggleShoppingItem(item.id, !checked);
            if (!r.ok) toast.error(r.error);
          })
        }
        className="flex min-h-14 flex-1 items-center gap-3 rounded-xl px-2 text-left active:bg-muted"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
            checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
        >
          {checked ? <CheckIcon className="size-4" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", checked ? "text-muted-foreground line-through" : "font-medium")}>{item.name}</span>
          {item.quantity ? <span className="block text-xs text-muted-foreground">{item.quantity}</span> : null}
        </span>
        {item.estimated_price_minor !== null ? (
          <span className="text-sm text-muted-foreground tabular">{formatMoney(item.estimated_price_minor, { currency })}</span>
        ) : null}
      </button>
      {canWrite ? (
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} disabled={pending} onClick={() => onEdit(item)}>
          <PencilIcon />
        </Button>
      ) : null}
    </li>
  );
}

export function ShoppingListView({
  listId,
  items,
  canWrite,
  currency,
}: {
  listId: string;
  items: Item[];
  canWrite: boolean;
  currency: string;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [pending, start] = useTransition();
  const open = items.filter((i) => !i.is_checked);
  const checked = items.filter((i) => i.is_checked);
  const estimate = open.reduce((s, i) => s + (i.estimated_price_minor ?? 0), 0);
  const symbol = currencySymbol(currency);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else after?.();
    });

  return (
    <div className="space-y-4">
      {canWrite ? (
        <form
          className="space-y-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-border/80"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveShoppingItem({ listId, name, quantity: qty, price }), () => {
              setName("");
              setQty("");
              setPrice("");
            });
          }}
        >
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item…" aria-label="Item" maxLength={120} />
            <Button type="submit" size="icon-lg" disabled={pending || !name.trim()} aria-label="Add item">
              {pending ? <Spinner /> : <PlusIcon />}
            </Button>
          </div>
          {name ? (
            <div className="grid grid-cols-2 gap-2">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty (e.g. 2 kg)" aria-label="Quantity" maxLength={40} />
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>{symbol}</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Est. price" aria-label="Estimated price" />
              </InputGroup>
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
        <span>
          {open.length} to get{estimate ? ` · about ${formatMoney(estimate, { currency })}` : ""}
        </span>
        {checked.length && canWrite ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => bulkShoppingAction(listId, "uncheck_all"))}>
              <ListRestartIcon data-icon="inline-start" /> Uncheck all
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => bulkShoppingAction(listId, "clear_checked"))}>
              <XIcon data-icon="inline-start" /> Clear checked
            </Button>
          </div>
        ) : null}
      </div>

      {items.length ? (
        <>
          {open.length ? (
            <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
              {open.map((i) => (
                <ItemRow key={i.id} item={i} canWrite={canWrite} currency={currency} onEdit={setEditing} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-success-soft p-4 text-center text-sm text-success">Everything&apos;s in the basket.</p>
          )}
          {checked.length ? (
            <ul className="divide-y rounded-2xl bg-card opacity-75 shadow-card ring-1 ring-border/80">
              {checked.map((i) => (
                <ItemRow key={i.id} item={i} canWrite={canWrite} currency={currency} onEdit={setEditing} />
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">This list is empty. Add the first item above.</p>
      )}

      <ResponsiveModal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title="Edit item">
        {editing ? <EditItemForm item={editing} listId={listId} currency={currency} onDone={() => setEditing(null)} /> : null}
      </ResponsiveModal>
    </div>
  );
}

function EditItemForm({ item, listId, currency, onDone }: { item: Item; listId: string; currency: string; onDone: () => void }) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.quantity ?? "");
  const [price, setPrice] = useState(minorToInput(item.estimated_price_minor));
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveShoppingItem({ id: item.id, listId, name, quantity: qty, price });
          if (!r.ok) toast.error(r.error);
          else onDone();
        });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Item" maxLength={120} />
      <div className="grid grid-cols-2 gap-2">
        <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity" aria-label="Quantity" maxLength={40} />
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>{currencySymbol(currency)}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" aria-label="Estimated price" />
        </InputGroup>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={pending || !name.trim()}>
          {pending ? <Spinner /> : null} Save
        </Button>
        <Button
          type="button"
          size="lg"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteShoppingItem(item.id);
              if (!r.ok) toast.error(r.error);
              else onDone();
            })
          }
        >
          <Trash2Icon data-icon="inline-start" /> Remove
        </Button>
      </div>
    </form>
  );
}

export function CopyListButton({ listId, name }: { listId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyShoppingList(listId, name);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.message);
            router.push(`/shopping/${r.data.id}`);
          }
        })
      }
    >
      {pending ? <Spinner /> : <CopyIcon data-icon="inline-start" />} Start a list from this
    </Button>
  );
}
