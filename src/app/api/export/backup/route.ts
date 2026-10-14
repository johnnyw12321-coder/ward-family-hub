import { NextResponse } from "next/server";
import { logServerError } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { BACKUP_TABLES } from "@/features/settings/backup-tables";

/** Unique sort keys for tables without an id column (stable pagination). */
const NO_ID_TABLES: Partial<Record<(typeof BACKUP_TABLES)[number], string[]>> = {
  household_members: ["user_id"],
  event_participants: ["event_id", "user_id"],
  event_completions: ["event_id", "occurrence_date"],
  family_health: ["family_member_id"],
};

/**
 * Full JSON export of the household's records, read as the signed-in user
 * (RLS applies), in pages of 1000 rows. Restoring is documented in
 * docs/BACKUP_AND_RECOVERY.md.
 */
export async function GET() {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { ctx } = auth;

  const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const query =
        table === "households"
          ? ctx.supabase.from(table).select("*").eq("id", ctx.household.id)
          : ctx.supabase.from(table).select("*").eq("household_id", ctx.household.id);
      let ordered = query;
      for (const column of NO_ID_TABLES[table] ?? ["id"]) ordered = ordered.order(column);
      const { data, error } = await ordered.range(from, from + 999);
      if (error) {
        logServerError(`backup:${table}`, error);
        return NextResponse.json({ error: "The backup could not be completed. Please try again." }, { status: 500 });
      }
      rows.push(...data);
      if (data.length < 1000) break;
    }
    tables[table] = rows;
  }

  const body = JSON.stringify(
    {
      format: "ward-family-hub-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      household_id: ctx.household.id,
      note: "Amounts are integer minor units (cents). Documents themselves are not included; see docs/BACKUP_AND_RECOVERY.md.",
      tables,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ward-hub-backup-${ctx.today}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
