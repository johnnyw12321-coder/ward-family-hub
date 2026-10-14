import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, FileTextIcon, LockIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteDocument, setDocumentArchived } from "@/features/documents/actions";
import { EditDocumentButton, ReplaceFileButton } from "@/features/documents/components/document-form";
import { expiryState } from "@/features/documents/components/document-list";
import { FileButton } from "@/features/documents/components/file-buttons";
import { formatBytes } from "@/features/documents/file-validation";
import { getDocumentFormOptions } from "@/features/documents/form-options";
import { getDocument, getDocumentFiles, getMfaState, signedFileUrl } from "@/features/documents/queries";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { formatDate, formatInstant } from "@/lib/dates";

export const metadata: Metadata = { title: "Document" };

export default function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <DocumentDetail params={params} />
    </Suspense>
  );
}

async function DocumentDetail({ params }: { params: PageProps<"/documents/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const doc = await getDocument(ctx, id);
  if (!doc) {
    // A sensitive document is invisible until the session is verified.
    if (ctx.aal !== "aal2") {
      const mfa = await getMfaState(ctx);
      if (mfa.enrolled) {
        return (
          <div className="space-y-4">
            <PageHeader title="Verification needed" back={{ href: "/documents", label: "Documents" }} />
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center shadow-card ring-1 ring-border/80">
              <ShieldAlertIcon className="size-8 text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">If this is a sensitive document, verify with your authenticator app to open it.</p>
              <Button asChild>
                <Link href={`/verify?next=/documents/${id}`}>Verify</Link>
              </Button>
            </div>
          </div>
        );
      }
    }
    notFound();
  }
  const [files, options] = await Promise.all([getDocumentFiles(ctx, id), getDocumentFormOptions(ctx)]);
  const current = files.find((f) => f.id === doc.current_file_id) ?? null;
  const category = options.categories.find((c) => c.id === doc.category_id);
  const exp = expiryState(doc.expiry_date, ctx.today, doc.expiry_reminder_days);
  // Inline preview for browser-displayable images, via a 2-minute signed URL.
  const previewable = current && ["image/jpeg", "image/png", "image/webp"].includes(current.mime_type);
  const previewUrl = previewable ? await signedFileUrl(ctx, current.storage_path, { seconds: 120 }) : null;
  const links: [string, string | null | undefined, string | null][] = [
    ["Home or vehicle", options.assets.find((a) => a.id === doc.asset_id)?.name, null],
    ["Account", options.accounts.find((a) => a.id === doc.account_id)?.name, doc.account_id ? `/finances/accounts/${doc.account_id}` : null],
    ["Bill", options.bills.find((b) => b.id === doc.recurring_id)?.name, doc.recurring_id ? `/finances/bills/${doc.recurring_id}` : null],
    ["Goal", options.goals.find((g) => g.id === doc.goal_id)?.name, doc.goal_id ? `/goals/${doc.goal_id}` : null],
    ["Transaction", doc.transaction_id ? "View receipt's transaction" : null, doc.transaction_id ? `/finances/transactions/${doc.transaction_id}` : null],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={doc.name}
        back={{ href: "/documents", label: "Documents" }}
        actions={
          <>
            {doc.is_sensitive ? (
              <Badge variant="secondary">
                <LockIcon aria-hidden /> Sensitive
              </Badge>
            ) : null}
            {doc.is_archived ? <Badge variant="outline">Archived</Badge> : null}
          </>
        }
      />

      {exp === "expired" || exp === "soon" ? (
        <p className={exp === "expired" ? "rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive" : "rounded-2xl bg-warning-soft px-4 py-3 text-sm"}>
          {exp === "expired" ? `Expired on ${formatDate(doc.expiry_date)}.` : `Expires on ${formatDate(doc.expiry_date)}.`} Upload the renewed copy with “Replace file”.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
        {previewUrl ? (
          // A private, short-lived URL: deliberately not routed through the image optimiser (which would cache it).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={`Preview of ${doc.name}`} className="max-h-[60vh] w-full bg-muted object-contain" referrerPolicy="no-referrer" />
        ) : current ? (
          <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <FileTextIcon className="size-8" aria-hidden />
            {current.mime_type === "application/pdf" ? "PDF — open it to view." : "Preview isn't available for this format. Download to view it."}
          </div>
        ) : (
          <p className="p-5 text-sm text-warning">The upload didn&apos;t complete. Use “Replace file” to add the file.</p>
        )}
        {current ? (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <FileButton fileId={current.id} mode="view" variant="default" />
            <FileButton fileId={current.id} mode="download" />
            <span className="ml-auto text-xs text-muted-foreground">
              {current.file_name} · {formatBytes(current.size_bytes)}
            </span>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <dl className="divide-y text-sm">
          {(
            [
              ["Category", category?.name],
              ["Belongs to", options.familyMembers.find((m) => m.id === doc.family_member_id)?.name ?? memberName(ctx.members, doc.related_user_id) ?? "Household"],
              ["Issued", doc.issue_date ? formatDate(doc.issue_date) : null],
              ["Expires", doc.expiry_date ? `${formatDate(doc.expiry_date)} · reminder ${doc.expiry_reminder_days} days before` : null],
              ["Tags", doc.tags.length ? doc.tags.map((t) => `#${t}`).join(" ") : null],
              ["Added", `${formatInstant(doc.created_at, ctx.household.timezone)} by ${memberName(ctx.members, doc.created_by) ?? "someone"}`],
            ] as [string, string | null | undefined][]
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          {links
            .filter(([, v]) => v)
            .map(([k, v, href]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">
                  {href ? (
                    <Link href={href} className="text-primary">
                      {v}
                    </Link>
                  ) : (
                    v
                  )}
                </dd>
              </div>
            ))}
        </dl>
        {doc.description ? <p className="mt-3 text-sm whitespace-pre-wrap">{doc.description}</p> : null}
      </section>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <ReplaceFileButton documentId={doc.id} />
          <EditDocumentButton
            options={options}
            aal2={ctx.aal === "aal2"}
            initial={{
              id: doc.id,
              name: doc.name,
              categoryId: doc.category_id,
              description: doc.description ?? "",
              tags: doc.tags.join(", "),
              issueDate: doc.issue_date ?? "",
              expiryDate: doc.expiry_date ?? "",
              expiryReminderDays: String(doc.expiry_reminder_days),
              isSensitive: doc.is_sensitive,
              relatedUserId: doc.related_user_id ?? "",
              accountId: doc.account_id ?? "",
              transactionId: doc.transaction_id ?? "",
              recurringId: doc.recurring_id ?? "",
              goalId: doc.goal_id ?? "",
              assetId: doc.asset_id ?? "",
              familyMemberId: doc.family_member_id ?? "",
            }}
          />
          <ConfirmAction
            action={setDocumentArchived.bind(null, doc.id, !doc.is_archived)}
            trigger={
              doc.is_archived ? (
                <>
                  <ArchiveRestoreIcon data-icon="inline-start" /> Restore
                </>
              ) : (
                <>
                  <ArchiveIcon data-icon="inline-start" /> Archive
                </>
              )
            }
            title={doc.is_archived ? "Restore this document?" : "Archive this document?"}
            description={doc.is_archived ? "It returns to the main list." : "It's hidden from the main list and stops expiry reminders. The file is kept."}
            confirmLabel={doc.is_archived ? "Restore" : "Archive"}
            destructive={false}
          />
          <ConfirmAction
            action={deleteDocument.bind(null, doc.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete this document permanently?"
            description={`All ${files.length} stored version${files.length === 1 ? "" : "s"} will be removed from storage. This can't be undone — archive it if you might need it later.`}
            confirmLabel="Delete permanently"
            redirectTo="/documents"
            variant="destructive"
          />
        </div>
      ) : null}

      {files.length > 1 ? (
        <section>
          <SectionHeading title="Version history" />
          <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    Version {f.version}
                    {f.id === doc.current_file_id ? " (current)" : ""}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {f.file_name} · {formatBytes(f.size_bytes)} · {formatInstant(f.created_at, ctx.household.timezone)} · {memberName(ctx.members, f.created_by) ?? "someone"}
                  </div>
                </div>
                <FileButton fileId={f.id} mode="download" size="sm" variant="ghost" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
