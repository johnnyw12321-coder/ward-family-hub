"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getActionContext, type HouseholdContext } from "@/lib/auth/context";
import { MAX_FILE_BYTES, isAllowedMime, normaliseDeclaredType, sanitizeFileName, sha256Hex, sniffFileType } from "./file-validation";
import { DOCUMENTS_BUCKET, signedFileUrl } from "./queries";
import { documentSchema, finishUploadSchema, parseTags, startUploadSchema } from "./schemas";

const uuid = z.uuid();
const empty = (v: string | undefined | null) => (v ? v : null);

const SENSITIVE_MESSAGE = "Sensitive documents need a two-factor check first. Verify, then try again.";

function rlsMessage(error: { code?: string; message?: string } | null, fallback?: string) {
  if (error?.code === "42501") return SENSITIVE_MESSAGE;
  return dbErrorMessage(error, fallback);
}

/** Documents the caller can see (RLS hides sensitive ones without two-factor). */
async function visibleDocument(ctx: HouseholdContext, id: string) {
  const { data } = await ctx.supabase
    .from("documents")
    .select("id, is_sensitive, current_file_id")
    .eq("household_id", ctx.household.id)
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; is_sensitive: boolean; current_file_id: string | null } | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export async function saveDocument(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  if (v.isSensitive && ctx.aal !== "aal2") return fail(SENSITIVE_MESSAGE);

  const row = {
    name: v.name,
    category_id: v.categoryId,
    description: empty(v.description),
    tags: parseTags(v.tags),
    issue_date: empty(v.issueDate),
    expiry_date: empty(v.expiryDate),
    expiry_reminder_days: Number(v.expiryReminderDays),
    is_sensitive: v.isSensitive,
    related_user_id: empty(v.relatedUserId),
    account_id: empty(v.accountId),
    transaction_id: empty(v.transactionId),
    recurring_id: empty(v.recurringId),
    goal_id: empty(v.goalId),
  };

  if (v.id) {
    const { data, error } = await ctx.supabase.from("documents").update(row).eq("household_id", ctx.household.id).eq("id", v.id).select("id");
    if (error) {
      if (error.code !== "42501") logServerError("updateDocument", error);
      return fail(rlsMessage(error));
    }
    if (!data?.length) return fail("That document no longer exists, or needs a two-factor check to change.");
    refresh();
    return ok({ id: v.id }, "Document updated");
  }

  // Insert without RETURNING so this works the same for sensitive documents.
  const id = randomUUID();
  const { error } = await ctx.supabase.from("documents").insert({ ...row, id, household_id: ctx.household.id });
  if (error) {
    if (error.code !== "42501") logServerError("createDocument", error);
    return fail(rlsMessage(error));
  }
  return ok({ id }, "Document saved");
}

export async function setDocumentArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid document.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data, error } = await ctx.supabase.from("documents").update({ is_archived: archived }).eq("household_id", ctx.household.id).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error && error.code !== "42501") logServerError("archiveDocument", error);
    return fail(rlsMessage(error, "Could not update the document."));
  }
  refresh();
  return ok(null, archived ? "Archived" : "Restored");
}

/** Deletes every stored version, then the document. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid document.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  if (!(await visibleDocument(ctx, id))) return fail("That document no longer exists, or needs a two-factor check.");
  const { data: files, error: filesError } = await ctx.supabase
    .from("document_files")
    .select("storage_path")
    .eq("household_id", ctx.household.id)
    .eq("document_id", id);
  if (filesError) {
    logServerError("deleteDocument.files", filesError);
    return fail("Could not delete the document.");
  }
  if (files.length) {
    const { error } = await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove(files.map((f) => f.storage_path as string));
    if (error) {
      console.error("[storage:remove]", { message: error.message });
      return fail("The stored file couldn't be removed, so the document was kept. Please try again.");
    }
  }
  const { error } = await ctx.supabase.from("documents").delete().eq("household_id", ctx.household.id).eq("id", id);
  if (error) {
    logServerError("deleteDocument", error);
    return fail(rlsMessage(error));
  }
  refresh();
  return ok(null, "Document deleted");
}

// ---------------------------------------------------------------------------
// Upload: 1) startUpload issues a short-lived signed upload URL for a path the
// server chooses; 2) the browser uploads straight to Storage (bucket limits
// apply); 3) finishUpload re-reads the stored bytes on the server, checks the
// real type and size, hashes it and records the version — or deletes it.
// ---------------------------------------------------------------------------
export async function startUpload(raw: unknown): Promise<ActionResult<{ fileId: string; path: string; token: string; contentType: string }>> {
  const parsed = startUploadSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid upload.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  if (v.size > MAX_FILE_BYTES) return fail("Files can be up to 25 MB.");
  const contentType = normaliseDeclaredType(v.contentType);
  if (!isAllowedMime(contentType)) return fail("Upload a PDF or a photo (JPEG, PNG, WebP or HEIC).");
  if (!(await visibleDocument(ctx, v.documentId))) return fail("That document no longer exists, or needs a two-factor check.");

  const fileId = randomUUID();
  const path = `${ctx.household.id}/${v.documentId}/${fileId}`;
  const { data, error } = await ctx.supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage:signedUpload]", { message: error?.message });
    return fail("The upload couldn't be started. Please try again.");
  }
  return ok({ fileId, path: data.path, token: data.token, contentType });
}

export async function finishUpload(raw: unknown): Promise<ActionResult<{ documentId: string }>> {
  const parsed = finishUploadSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid upload.");
  const auth = await getActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const v = parsed.data;
  const path = `${ctx.household.id}/${v.documentId}/${v.fileId}`;
  const storage = ctx.supabase.storage.from(DOCUMENTS_BUCKET);

  const reject = async (message: string): Promise<ActionResult<{ documentId: string }>> => {
    await storage.remove([path]);
    if (v.discardDocumentOnFailure) {
      const doc = await visibleDocument(ctx, v.documentId);
      if (doc && !doc.current_file_id) await ctx.supabase.from("documents").delete().eq("household_id", ctx.household.id).eq("id", v.documentId);
    }
    refresh();
    return fail(message);
  };

  const { data: blob, error } = await storage.download(path);
  if (error || !blob) {
    console.error("[storage:download]", { message: error?.message });
    return fail("The uploaded file couldn't be found. Please try again.");
  }
  if (blob.size === 0 || blob.size > MAX_FILE_BYTES) return reject("Files can be up to 25 MB.");
  const buffer = await blob.arrayBuffer();
  const sniffed = sniffFileType(new Uint8Array(buffer.slice(0, 64)));
  if (!sniffed) return reject("That file isn't a PDF or a supported photo format, so it wasn't kept.");
  const declared = normaliseDeclaredType(blob.type || "");
  if (declared && declared !== "application/octet-stream" && declared !== sniffed) {
    return reject("The file's contents don't match its type, so it wasn't kept.");
  }

  const { data: versions } = await ctx.supabase
    .from("document_files")
    .select("version")
    .eq("household_id", ctx.household.id)
    .eq("document_id", v.documentId)
    .order("version", { ascending: false })
    .limit(1);
  const version = (versions?.[0]?.version ?? 0) + 1;

  const { error: insertError } = await ctx.supabase.from("document_files").insert({
    id: v.fileId,
    household_id: ctx.household.id,
    document_id: v.documentId,
    version,
    storage_path: path,
    file_name: sanitizeFileName(v.fileName),
    mime_type: sniffed,
    size_bytes: buffer.byteLength,
    sha256: await sha256Hex(buffer),
  });
  if (insertError) {
    logServerError("finishUpload.record", insertError);
    return reject(rlsMessage(insertError, "The file couldn't be saved. Please try again."));
  }
  const { error: linkError } = await ctx.supabase
    .from("documents")
    .update({ current_file_id: v.fileId })
    .eq("household_id", ctx.household.id)
    .eq("id", v.documentId);
  if (linkError) {
    logServerError("finishUpload.link", linkError);
    return fail("The file was saved but couldn't be made current. Please refresh.");
  }
  refresh();
  return ok({ documentId: v.documentId }, version > 1 ? `Replaced (version ${version})` : "Uploaded");
}

/** A 60-second link to view or download a stored file. */
export async function getFileLink(fileId: string, mode: "view" | "download"): Promise<ActionResult<{ url: string }>> {
  if (!uuid.safeParse(fileId).success) return fail("Invalid file.");
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { data: file } = await ctx.supabase
    .from("document_files")
    .select("storage_path, file_name")
    .eq("household_id", ctx.household.id)
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return fail("That file isn't available. Sensitive documents need a two-factor check.");
  const url = await signedFileUrl(ctx, file.storage_path as string, { download: mode === "download" ? (file.file_name as string) : undefined });
  if (!url) return fail("Couldn't create a secure link. Please try again.");
  return ok({ url });
}
