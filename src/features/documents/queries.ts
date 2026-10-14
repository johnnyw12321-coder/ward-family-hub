import "server-only";
import { ilikeOperand } from "@/features/finance/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import type { CalendarDate } from "@/lib/dates";

export const DOCUMENTS_BUCKET = "documents";

export type DocumentCategory = { id: string; name: string; system_key: string | null; sensitive_default: boolean; sort_order: number };

export type DocumentFile = {
  id: string;
  document_id: string;
  version: number;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  name: string;
  category_id: string;
  description: string | null;
  tags: string[];
  issue_date: CalendarDate | null;
  expiry_date: CalendarDate | null;
  expiry_reminder_days: number;
  is_sensitive: boolean;
  is_archived: boolean;
  account_id: string | null;
  transaction_id: string | null;
  recurring_id: string | null;
  goal_id: string | null;
  related_user_id: string | null;
  current_file_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  current_file: Pick<DocumentFile, "id" | "file_name" | "mime_type" | "size_bytes"> | null;
};

const COLUMNS =
  "id, name, category_id, description, tags, issue_date, expiry_date, expiry_reminder_days, is_sensitive, is_archived, account_id, transaction_id, recurring_id, goal_id, related_user_id, current_file_id, created_by, created_at, updated_at, current_file:document_files!documents_household_id_current_file_id_fkey(id, file_name, mime_type, size_bytes)";

function fail(scope: string, error: { message?: string; code?: string }): never {
  console.error(`[query:${scope}]`, { code: error.code, message: error.message });
  throw new Error(`Could not load ${scope}`);
}

function normalise(r: Record<string, unknown>): DocumentRow {
  const file = (Array.isArray(r.current_file) ? r.current_file[0] : r.current_file) as DocumentRow["current_file"] | undefined;
  return { ...(r as DocumentRow), current_file: file ? { ...file, size_bytes: Number(file.size_bytes) } : null };
}

export async function getDocumentCategories(ctx: HouseholdContext): Promise<DocumentCategory[]> {
  const { data, error } = await ctx.supabase
    .from("document_categories")
    .select("id, name, system_key, sensitive_default, sort_order")
    .eq("household_id", ctx.household.id)
    .eq("is_archived", false)
    .order("sort_order");
  if (error) fail("document categories", error);
  return data as DocumentCategory[];
}

export async function getDocuments(
  ctx: HouseholdContext,
  filters: { q?: string; category?: string; archived?: boolean; transactionId?: string; recurringId?: string; accountId?: string; goalId?: string } = {},
): Promise<DocumentRow[]> {
  let query = ctx.supabase.from("documents").select(COLUMNS).eq("household_id", ctx.household.id).eq("is_archived", Boolean(filters.archived));
  if (filters.q) {
    const p = ilikeOperand(filters.q);
    const tag = filters.q.toLowerCase().replace(/[^a-z0-9 _-]/g, "").slice(0, 30);
    query = query.or(`name.ilike.${p},description.ilike.${p}${tag ? `,tags.cs.{"${tag}"}` : ""}`);
  }
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.transactionId) query = query.eq("transaction_id", filters.transactionId);
  if (filters.recurringId) query = query.eq("recurring_id", filters.recurringId);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.goalId) query = query.eq("goal_id", filters.goalId);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(500);
  if (error) fail("documents", error);
  return data.map(normalise);
}

export async function getDocument(ctx: HouseholdContext, id: string): Promise<DocumentRow | null> {
  const { data, error } = await ctx.supabase.from("documents").select(COLUMNS).eq("household_id", ctx.household.id).eq("id", id).maybeSingle();
  if (error) fail("document", error);
  return data ? normalise(data) : null;
}

export async function getDocumentFiles(ctx: HouseholdContext, documentId: string): Promise<DocumentFile[]> {
  const { data, error } = await ctx.supabase
    .from("document_files")
    .select("id, document_id, version, storage_path, file_name, mime_type, size_bytes, created_by, created_at")
    .eq("household_id", ctx.household.id)
    .eq("document_id", documentId)
    .order("version", { ascending: false });
  if (error) fail("document files", error);
  return data.map((f) => ({ ...(f as DocumentFile), size_bytes: Number(f.size_bytes) }));
}

export async function getExpiringDocuments(ctx: HouseholdContext, from: CalendarDate, to: CalendarDate): Promise<DocumentRow[]> {
  const { data, error } = await ctx.supabase
    .from("documents")
    .select(COLUMNS)
    .eq("household_id", ctx.household.id)
    .eq("is_archived", false)
    .gte("expiry_date", from)
    .lte("expiry_date", to)
    .order("expiry_date");
  if (error) fail("expiring documents", error);
  return data.map(normalise);
}

/** Short-lived signed URL (RLS on storage applies, so sensitive files need aal2). */
export async function signedFileUrl(ctx: HouseholdContext, storagePath: string, options: { download?: string; seconds?: number } = {}): Promise<string | null> {
  const { data, error } = await ctx.supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, options.seconds ?? 60, options.download ? { download: options.download } : undefined);
  if (error) {
    console.error("[storage:signedUrl]", { message: error.message });
    return null;
  }
  return data.signedUrl;
}

/** Whether the user has a verified TOTP factor (for step-up prompts). */
export async function getMfaState(ctx: HouseholdContext): Promise<{ enrolled: boolean; verifiedFactorIds: string[]; aal2: boolean }> {
  const { data, error } = await ctx.supabase.auth.mfa.listFactors();
  if (error) return { enrolled: false, verifiedFactorIds: [], aal2: ctx.aal === "aal2" };
  const verified = (data.totp ?? []).filter((f) => f.status === "verified").map((f) => f.id);
  return { enrolled: verified.length > 0, verifiedFactorIds: verified, aal2: ctx.aal === "aal2" };
}
