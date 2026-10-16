import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, connection } from "next/server";
import { requireSupabaseConfig } from "@/lib/env";
import { pushConfigured, reminderPayload, sendPush } from "@/lib/push";

/**
 * Daily push job (Vercel Cron, ~07:00 Trinidad time). Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`. It talks to the database with the
 * publishable key and the job's own PUSH_DISPATCH_TOKEN, which can only list
 * today's unsent reminders and record what was sent — never the service role.
 */
function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Pending = { delivery_id: string; user_id: string; endpoint: string; p256dh: string; auth_secret: string; title: string; body: string | null; link_path: string | null };

export async function GET(request: Request) {
  await connection();
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = process.env.PUSH_DISPATCH_TOKEN;
  if (!token || !pushConfigured()) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });

  const { url, key } = requireSupabaseConfig();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("push_pending", { p_token: token });
  if (error) {
    console.error("[cron:push] pending", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Could not load reminders" }, { status: 500 });
  }
  const rows = (data ?? []) as Pending[];

  // One notification per phone, summarising that person's reminders.
  const byPhone = new Map<string, { target: { endpoint: string; p256dh: string; auth: string }; rows: Pending[] }>();
  for (const r of rows) {
    const entry = byPhone.get(r.endpoint) ?? { target: { endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth_secret }, rows: [] };
    entry.rows.push(r);
    byPhone.set(r.endpoint, entry);
  }
  const reached = new Set<string>();
  const sentDeliveries = new Set<string>();
  const gone: string[] = [];
  for (const { target, rows: reminders } of byPhone.values()) {
    const unique = [...new Map(reminders.map((r) => [r.delivery_id, r])).values()];
    const result = await sendPush(target, reminderPayload(unique));
    if (result === "sent") {
      reached.add(target.endpoint);
      unique.forEach((r) => sentDeliveries.add(r.delivery_id));
    } else if (result === "gone") gone.push(target.endpoint);
  }
  const allDeliveries = new Set(rows.map((r) => r.delivery_id));
  const failed = [...allDeliveries].filter((id) => !sentDeliveries.has(id));
  const { error: recordError } = await db.rpc("push_record", {
    p_token: token,
    p_sent: [...sentDeliveries],
    p_failed: failed,
    p_gone: gone,
    p_reached: [...reached],
  });
  if (recordError) console.error("[cron:push] record", { code: recordError.code, message: recordError.message });
  return NextResponse.json({ phones: byPhone.size, sent: reached.size, reminders: allDeliveries.size, gone: gone.length });
}
