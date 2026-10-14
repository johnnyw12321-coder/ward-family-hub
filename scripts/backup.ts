/**
 * Owner-run database backup, independent of the web app. Writes every
 * household table to backups/ward-hub-<timestamp>.json (git-ignored).
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
  mkdirSync("backups", { recursive: true });
  const file = path.join("backups", `ward-hub-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ format: "ward-family-hub-backup", version: 1, exported_at: new Date().toISOString(), tables: out }, null, 2));
  console.log(`\nSaved ${file}. Store it somewhere private; it contains financial records.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
