/**
 * Owner-run backup, independent of the web app. Writes every household table
 * to backups/ward-hub-<timestamp>/data.json and every stored document file to
 * backups/ward-hub-<timestamp>/files/<storage path> (all git-ignored).
 * Uses the service-role key, so run it only on a trusted computer and keep the
 * output somewhere private (an encrypted drive or password-manager vault).
 *
 *   npm run backup
 *
 * This complements Supabase's own daily backups (see docs/BACKUP_AND_RECOVERY.md).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BACKUP_TABLES } from "../src/features/settings/backup-tables";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or your shell).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const out: Record<string, unknown[]> = {};
  for (const table of [...BACKUP_TABLES, "profiles"] as const) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select("*").range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    out[table] = rows;
    console.log(`• ${table}: ${rows.length} rows`);
  }
  const dir = path.join("backups", `ward-hub-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "data.json"),
    JSON.stringify({ format: "ward-family-hub-backup", version: 1, exported_at: new Date().toISOString(), tables: out }, null, 2),
  );

  // Document files, saved under their storage path (household/document/file).
  const files = (out.document_files ?? []) as { storage_path: string }[];
  let saved = 0;
  for (const f of files) {
    const { data, error } = await db.storage.from("documents").download(f.storage_path);
    if (error || !data) {
      console.error(`  ! could not download ${f.storage_path}: ${error?.message ?? "unknown error"}`);
      continue;
    }
    const target = path.join(dir, "files", ...f.storage_path.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await data.arrayBuffer()));
    saved++;
  }
  console.log(`• document files: ${saved} of ${files.length}`);
  console.log(`\nSaved ${dir}. Keep it private and encrypted: it contains financial records and personal documents.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
