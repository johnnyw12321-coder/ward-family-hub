"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CameraIcon, FileUpIcon, LockIcon, PencilIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { deleteDocument, finishUpload, saveDocument, startUpload } from "../actions";
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, formatBytes, suggestDocumentName } from "../file-validation";
import { documentSchema, type DocumentInput } from "../schemas";

export type Option = { id: string; name: string };
export type DocumentFormOptions = {
  categories: (Option & { sensitive_default: boolean })[];
  members: { user_id: string; display_name: string }[];
  accounts: Option[];
  bills: Option[];
  goals: Option[];
  assets: Option[];
  familyMembers: Option[];
};

/** Uploads a file into an existing document: signed URL → direct upload → server verification. */
async function uploadFile(documentId: string, file: File, discardDocumentOnFailure: boolean) {
  const start = await startUpload({ documentId, fileName: file.name, size: file.size, contentType: file.type || "application/octet-stream" });
  if (!start.ok) return start;
  const { error } = await createBrowserSupabase()
    .storage.from("documents")
    .uploadToSignedUrl(start.data.path, start.data.token, file, { contentType: start.data.contentType, upsert: false });
  if (error) return { ok: false as const, error: "The upload didn't finish. Check your connection and try again." };
  return finishUpload({ documentId, fileId: start.data.fileId, fileName: file.name, discardDocumentOnFailure });
}

function FilePicker({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const choose = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error("Files can be up to 25 MB.");
      return;
    }
    onFile(f);
  };
  return (
    <div className="space-y-2">
      <input ref={choose} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-medium">{file.name}</span> <span className="text-muted-foreground">· {formatBytes(file.size)}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onFile(null)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => choose.current?.click()}>
            <FileUpIcon data-icon="inline-start" /> Choose file
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => camera.current?.click()}>
            <CameraIcon data-icon="inline-start" /> Take photo
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, WebP or HEIC, up to 25 MB. Files are checked on the server and stored privately.</p>
    </div>
  );
}

export function DocumentForm({
  options,
  initial,
  aal2,
  onSaved,
}: {
  options: DocumentFormOptions;
  initial?: Partial<DocumentInput>;
  aal2: boolean;
  onSaved: (id: string) => void;
}) {
  const editing = Boolean(initial?.id);
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const [stage, setStage] = useState<string | null>(null);
  const firstCategory = options.categories.find((c) => c.id === initial?.categoryId) ?? options.categories[0];
  const form = useForm<DocumentInput>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      name: "",
      categoryId: firstCategory?.id ?? "",
      description: "",
      tags: "",
      issueDate: "",
      expiryDate: "",
      expiryReminderDays: "30",
      isSensitive: editing ? false : Boolean(firstCategory?.sensitive_default && aal2),
      relatedUserId: "",
      accountId: "",
      transactionId: "",
      recurringId: "",
      goalId: "",
      assetId: "",
      familyMemberId: "",
      ...initial,
    },
  });
  const { register, control, formState, setValue, getFieldState } = form;
  const err = formState.errors;
  const sensitive = useWatch({ control, name: "isSensitive" });
  const categoryId = useWatch({ control, name: "categoryId" });
  const suggestsSensitive = options.categories.find((c) => c.id === categoryId)?.sensitive_default ?? false;

  const submit = form.handleSubmit((values) =>
    start(async () => {
      if (!editing && !file) {
        toast.error("Choose a file to upload.");
        return;
      }
      setStage("Saving details…");
      const saved = await saveDocument(values);
      if (!saved.ok) {
        for (const [k, m] of Object.entries(saved.fieldErrors ?? {})) form.setError(k as keyof DocumentInput, { message: m });
        toast.error(saved.error);
        setStage(null);
        return;
      }
      if (file) {
        setStage("Uploading securely…");
        const up = await uploadFile(saved.data.id, file, !editing);
        if (!up.ok) {
          if (!editing) await deleteDocument(saved.data.id);
          toast.error(up.error);
          setStage(null);
          return;
        }
      }
      setStage(null);
      toast.success(editing ? "Document updated" : "Document stored");
      onSaved(saved.data.id);
    }),
  );

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      {!editing ? (
        <FilePicker
          file={file}
          onFile={(f) => {
            setFile(f);
            if (f && !getFieldState("name").isDirty && !form.getValues("name")) setValue("name", suggestDocumentName(f.name));
          }}
        />
      ) : null}
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.name)}>
          <FieldLabel htmlFor="doc-name">Name</FieldLabel>
          <Input id="doc-name" placeholder="e.g. Jonathan's passport" {...register("name")} />
          <FieldError>{err.name?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="doc-cat">Category</FieldLabel>
            <NativeSelect
              id="doc-cat"
              {...register("categoryId", {
                onChange: (e) => {
                  const c = options.categories.find((x) => x.id === e.target.value);
                  if (!editing && !getFieldState("isSensitive").isDirty) setValue("isSensitive", Boolean(c?.sensitive_default && aal2));
                },
              })}
            >
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {options.familyMembers.length ? (
            <Field>
              <FieldLabel htmlFor="doc-family">Belongs to</FieldLabel>
              <NativeSelect id="doc-family" {...register("familyMemberId")}>
                <option value="">Household</option>
                {options.familyMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="doc-person">Belongs to</FieldLabel>
              <NativeSelect id="doc-person" {...register("relatedUserId")}>
                <option value="">Household</option>
                {options.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <Controller
          control={control}
          name="isSensitive"
          render={({ field }) => (
            <Field orientation="horizontal" className="justify-between rounded-xl bg-muted/60 p-3">
              <div>
                <FieldLabel htmlFor="doc-sensitive" className="font-normal">
                  <LockIcon className="size-4" aria-hidden /> Sensitive
                </FieldLabel>
                <FieldDescription>
                  {aal2
                    ? "Only visible after a two-factor check, even to signed-in household members."
                    : "Requires a two-factor check in this session."}
                </FieldDescription>
              </div>
              <Switch id="doc-sensitive" checked={field.value} disabled={!aal2} onCheckedChange={field.onChange} />
            </Field>
          )}
        />
        {!aal2 && suggestsSensitive && !sensitive ? (
          <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              This kind of document is usually kept sensitive.{" "}
              <Link href="/verify?next=/documents/new" className="font-medium text-primary underline">
                Verify with two-factor
              </Link>{" "}
              first to protect it.
            </span>
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="doc-issued">Issued</FieldLabel>
            <Input id="doc-issued" type="date" {...register("issueDate")} />
          </Field>
          <Field data-invalid={Boolean(err.expiryDate)}>
            <FieldLabel htmlFor="doc-expiry">Expires</FieldLabel>
            <Input id="doc-expiry" type="date" {...register("expiryDate")} />
            <FieldError>{err.expiryDate?.message}</FieldError>
          </Field>
        </div>
        <Field data-invalid={Boolean(err.expiryReminderDays)}>
          <FieldLabel htmlFor="doc-remind">Remind me before expiry (days)</FieldLabel>
          <Input id="doc-remind" inputMode="numeric" {...register("expiryReminderDays")} />
          <FieldError>{err.expiryReminderDays?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="doc-tags">Tags</FieldLabel>
          <Input id="doc-tags" placeholder="e.g. car, 2026, renewal" {...register("tags")} />
          <FieldDescription>Separate with commas.</FieldDescription>
        </Field>

        <details className="rounded-xl border px-3 py-2" open={Boolean(initial?.accountId || initial?.recurringId || initial?.goalId || initial?.transactionId || initial?.assetId)}>
          <summary className="cursor-pointer text-sm font-medium">Link to a home, vehicle, account, bill or goal</summary>
          <div className="mt-3 grid gap-3">
            {options.assets.length ? (
              <Field>
                <FieldLabel htmlFor="doc-asset">Home or vehicle</FieldLabel>
                <NativeSelect id="doc-asset" {...register("assetId")}>
                  <option value="">None</option>
                  {options.assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="doc-account">Account</FieldLabel>
              <NativeSelect id="doc-account" {...register("accountId")}>
                <option value="">None</option>
                {options.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="doc-bill">Bill or recurring item</FieldLabel>
              <NativeSelect id="doc-bill" {...register("recurringId")}>
                <option value="">None</option>
                {options.bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="doc-goal">Goal</FieldLabel>
              <NativeSelect id="doc-goal" {...register("goalId")}>
                <option value="">None</option>
                {options.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {initial?.transactionId ? <p className="text-xs text-muted-foreground">Attached to a transaction as a receipt.</p> : null}
          </div>
        </details>

        <Field>
          <FieldLabel htmlFor="doc-desc">Notes</FieldLabel>
          <Textarea id="doc-desc" rows={2} placeholder="Never store passwords, PINs or recovery codes here." {...register("description")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {stage ?? (editing ? "Save changes" : "Store document")}
      </Button>
    </form>
  );
}

export function NewDocumentPageForm({ options, initial, aal2 }: { options: DocumentFormOptions; initial?: Partial<DocumentInput>; aal2: boolean }) {
  const router = useRouter();
  return <DocumentForm options={options} initial={initial} aal2={aal2} onSaved={(id) => router.push(`/documents/${id}`)} />;
}

export function EditDocumentButton({ options, initial, aal2 }: { options: DocumentFormOptions; initial: Partial<DocumentInput>; aal2: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" /> Edit details
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Edit document">
        {open ? <DocumentForm options={options} initial={initial} aal2={aal2} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

export function ReplaceFileButton({ documentId }: { documentId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > MAX_FILE_BYTES) {
            toast.error("Files can be up to 25 MB.");
            return;
          }
          start(async () => {
            const r = await uploadFile(documentId, f, false);
            if (!r.ok) toast.error(r.error);
            else toast.success(r.message ?? "Replaced");
          });
        }}
      />
      <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />} {pending ? "Uploading…" : "Replace file"}
      </Button>
    </>
  );
}
