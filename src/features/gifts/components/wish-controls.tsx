"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CameraIcon, CheckIcon, GiftIcon, ImageIcon, PackageCheckIcon, PencilIcon, PlusIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { currencySymbol } from "@/lib/money";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { claimWish, finishWishPhoto, releaseClaim, removeWish, removeWishPhoto, saveWish, setWishReceived, startWishPhoto, updateClaim } from "../actions";
import { compressImage } from "../compress-image";
import { OCCASION_LABELS, OCCASIONS, claimSchema, wishSchema, type ClaimInput, type Occasion, type WishInput } from "../schemas";

function useAction() {
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await action();
      if (!r.ok) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        after?.();
      }
    });
  return { pending, run };
}

/** Photo → shrink in the browser → signed upload → server check. */
async function uploadPhoto(itemId: string, file: File): Promise<ActionResult> {
  let blob: Blob;
  try {
    blob = await compressImage(file);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't prepare the photo." };
  }
  const start = await startWishPhoto(itemId);
  if (!start.ok) return start;
  const { error } = await createBrowserSupabase()
    .storage.from("wishlist")
    .uploadToSignedUrl(start.data.path, start.data.token, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) return { ok: false, error: "The photo didn't upload. Check your connection and try again." };
  return finishWishPhoto(itemId, start.data.fileId);
}

function PhotoPicker({
  current,
  chosen,
  removed,
  onFile,
  onRemove,
}: {
  current: string | null;
  /** Object URL of a newly chosen photo. */
  chosen: string | null;
  removed: boolean;
  onFile: (f: File) => void;
  onRemove: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const shown = chosen ?? (removed ? null : current);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Choose a photo.");
      return;
    }
    onFile(f);
  };
  return (
    <div className="space-y-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      {shown ? (
        <div className="relative overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview / signed storage URL */}
          <img src={shown} alt="" className="aspect-[4/3] w-full object-cover" />
          <Button type="button" size="icon" variant="secondary" className="absolute top-2 right-2 rounded-full" aria-label="Remove photo" onClick={onRemove}>
            <XIcon aria-hidden />
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => camera.current?.click()}>
          <CameraIcon aria-hidden /> Take photo
        </Button>
        <Button type="button" variant="outline" onClick={() => gallery.current?.click()}>
          <ImageIcon aria-hidden /> Choose photo
        </Button>
      </div>
    </div>
  );
}

function WishForm({
  initial,
  mode,
  currentImage,
  onDone,
}: {
  initial: WishInput;
  mode: "own" | "surprise" | "shared";
  currentImage: string | null;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  // Free the local preview when the form closes.
  const latest = useRef(photo);
  useEffect(() => {
    latest.current = photo;
  }, [photo]);
  useEffect(() => () => {
    if (latest.current) URL.revokeObjectURL(latest.current.url);
  }, []);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const form = useForm<WishInput>({ resolver: zodResolver(wishSchema), defaultValues: initial });
  const err = form.formState.errors;
  const priority = useWatch({ control: form.control, name: "priority" });
  const submit = (v: WishInput) =>
    start(async () => {
      const saved = await saveWish(v);
      if (!saved.ok) {
        for (const [k, m] of Object.entries(saved.fieldErrors ?? {})) form.setError(k as keyof WishInput, { message: m });
        toast.error(saved.error);
        return;
      }
      if (photo) {
        const r = await uploadPhoto(saved.data.id, photo.file);
        if (!r.ok) toast.error(`Saved, but ${r.error.charAt(0).toLowerCase()}${r.error.slice(1)}`);
      } else if (photoRemoved && currentImage) {
        const r = await removeWishPhoto(saved.data.id);
        if (!r.ok) toast.error(r.error);
      }
      if (saved.message) toast.success(saved.message);
      onDone();
    });
  return (
    <form noValidate className="space-y-5" onSubmit={form.handleSubmit(submit)}>
      {mode === "surprise" ? (
        <p className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          A surprise idea: it goes on their list, but they won&apos;t see it.
        </p>
      ) : null}
      <PhotoPicker
        current={currentImage}
        chosen={photo?.url ?? null}
        removed={photoRemoved}
        onFile={(f) => {
          if (photo) URL.revokeObjectURL(photo.url);
          setPhoto({ file: f, url: URL.createObjectURL(f) });
          setPhotoRemoved(false);
        }}
        onRemove={() => {
          if (photo) URL.revokeObjectURL(photo.url);
          setPhoto(null);
          setPhotoRemoved(true);
        }}
      />
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.link)}>
          <FieldLabel htmlFor="w-link">Link</FieldLabel>
          <Input id="w-link" type="url" inputMode="url" placeholder="Paste a shop, Instagram or Amazon link" {...form.register("link")} />
          <FieldDescription>Optional. With a link, the shop&apos;s picture and name are added for you.</FieldDescription>
          <FieldError>{err.link?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(err.title)}>
          <FieldLabel htmlFor="w-title">What is it?</FieldLabel>
          <Input id="w-title" maxLength={120} placeholder="e.g. Tan leather crossbody bag" {...form.register("title")} />
          <FieldError>{err.title?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(err.details)}>
          <FieldLabel htmlFor="w-details">Details</FieldLabel>
          <Textarea id="w-details" rows={2} maxLength={1000} placeholder="Size, colour, model…" {...form.register("details")} />
          <FieldError>{err.details?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(err.store)}>
          <FieldLabel htmlFor="w-store">Where to get it</FieldLabel>
          <Input id="w-store" maxLength={160} placeholder="e.g. Long Circular Mall, 2nd floor" {...form.register("store")} />
          <FieldError>{err.store?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.price)}>
            <FieldLabel htmlFor="w-price">Price</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{currencySymbol()}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="w-price" inputMode="decimal" className="tabular" placeholder="0.00" {...form.register("price")} />
            </InputGroup>
            <FieldError>{err.price?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel id="w-priority">How much?</FieldLabel>
            <div role="radiogroup" aria-labelledby="w-priority" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["love", "like"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={priority === p}
                  onClick={() => form.setValue("priority", p)}
                  className={cn("h-8 rounded-md text-sm font-medium", priority === p ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {p === "love" ? "Love it" : "Like it"}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {pending ? (photo ? "Saving and uploading…" : "Saving…") : initial.id ? "Save" : "Add to the list"}
      </Button>
    </form>
  );
}

export function WishFormButton({
  initial,
  mode,
  label,
  title,
  currentImage = null,
  variant = "default",
  size = "default",
}: {
  initial: WishInput;
  mode: "own" | "surprise" | "shared";
  label: ReactNode;
  title: string;
  currentImage?: string | null;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={title}>
        {open ? <WishForm initial={initial} mode={mode} currentImage={currentImage} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

export function AddWishButton({ list, mode, label }: { list: string; mode: "own" | "surprise" | "shared"; label: string }) {
  return (
    <WishFormButton
      initial={{ list, title: "", details: "", link: "", store: "", price: "", priority: "like" }}
      mode={mode}
      title={label}
      label={
        <>
          <PlusIcon aria-hidden /> {label}
        </>
      }
    />
  );
}

/** Controls for something on your own (or a shared) list. */
export function ItemControls({
  id,
  initial,
  mode,
  received,
  image,
}: {
  id: string;
  initial: WishInput;
  mode: "own" | "surprise" | "shared";
  received: boolean;
  image: string | null;
}) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      {mode === "own" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setWishReceived(id, !received))}>
          {received ? <Undo2Icon aria-hidden /> : <PackageCheckIcon aria-hidden />} {received ? "Put back on list" : "I got this"}
        </Button>
      ) : null}
      {!received ? (
        <WishFormButton
          initial={initial}
          mode={mode}
          currentImage={image}
          title="Edit"
          variant="ghost"
          size="sm"
          label={
            <>
              <PencilIcon aria-hidden /> Edit
            </>
          }
        />
      ) : null}
      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => run(() => removeWish(id))}>
        <Trash2Icon aria-hidden /> Remove
      </Button>
    </div>
  );
}

function ClaimForm({ itemId, defaultOccasion, onDone }: { itemId: string; defaultOccasion: Occasion; onDone: () => void }) {
  const { pending, run } = useAction();
  const form = useForm<ClaimInput>({ resolver: zodResolver(claimSchema), defaultValues: { itemId, occasion: defaultOccasion, note: "" } });
  return (
    <form noValidate className="space-y-5" onSubmit={form.handleSubmit((v) => run(() => claimWish(v), onDone))}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="c-occasion">For</FieldLabel>
          <NativeSelect id="c-occasion" {...form.register("occasion")}>
            {OCCASIONS.map((o) => (
              <option key={o} value={o}>
                {OCCASION_LABELS[o]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="c-note">Note to yourself</FieldLabel>
          <Input id="c-note" maxLength={500} placeholder="e.g. Check the colour in store" {...form.register("note")} />
        </Field>
      </FieldGroup>
      <p className="text-xs text-muted-foreground">They won&apos;t see that you picked this, or any note you add.</p>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <GiftIcon aria-hidden />} I&apos;ll get this
      </Button>
    </form>
  );
}

function BoughtForm({ claimId, price, onDone }: { claimId: string; price: string; onDone: () => void }) {
  const { pending, run } = useAction();
  const [paid, setPaid] = useState(price);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateClaim({ id: claimId, status: "bought", pricePaid: paid }), onDone);
      }}
    >
      <Field>
        <FieldLabel htmlFor="b-paid">What you paid</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>{currencySymbol()}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput id="b-paid" inputMode="decimal" className="tabular" autoFocus value={paid} onChange={(e) => setPaid(e.target.value)} />
        </InputGroup>
        <FieldDescription>Optional. To count it in your budget, also record it as an expense under Gifts with the + button.</FieldDescription>
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <CheckIcon aria-hidden />} Mark as bought
      </Button>
    </form>
  );
}

/** Claim controls on someone else's list (never shown to the list's owner). */
export function ClaimControls({
  itemId,
  myClaim,
  defaultOccasion,
  price,
}: {
  itemId: string;
  myClaim: { id: string; status: "planned" | "bought" | "given" } | null;
  defaultOccasion: Occasion;
  price: string;
}) {
  const { pending, run } = useAction();
  const [modal, setModal] = useState<"claim" | "bought" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {!myClaim ? (
        <Button size="sm" onClick={() => setModal("claim")}>
          <GiftIcon aria-hidden /> I&apos;ll get this
        </Button>
      ) : myClaim.status === "planned" ? (
        <Button size="sm" onClick={() => setModal("bought")}>
          <CheckIcon aria-hidden /> Bought it
        </Button>
      ) : myClaim.status === "bought" ? (
        <Button size="sm" disabled={pending} onClick={() => run(() => updateClaim({ id: myClaim.id, status: "given" }))}>
          <GiftIcon aria-hidden /> Given
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateClaim({ id: myClaim.id, status: "bought" }))}>
          <Undo2Icon aria-hidden /> Not given yet
        </Button>
      )}
      {myClaim && myClaim.status !== "given" ? (
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => run(() => releaseClaim(myClaim.id))}>
          <XIcon aria-hidden /> Not getting it
        </Button>
      ) : null}
      <ResponsiveModal open={modal === "claim"} onOpenChange={(o) => setModal(o ? "claim" : null)} title="I'll get this">
        {modal === "claim" ? <ClaimForm itemId={itemId} defaultOccasion={defaultOccasion} onDone={() => setModal(null)} /> : null}
      </ResponsiveModal>
      <ResponsiveModal open={modal === "bought"} onOpenChange={(o) => setModal(o ? "bought" : null)} title="Bought it">
        {modal === "bought" && myClaim ? <BoughtForm claimId={myClaim.id} price={price} onDone={() => setModal(null)} /> : null}
      </ResponsiveModal>
    </div>
  );
}
