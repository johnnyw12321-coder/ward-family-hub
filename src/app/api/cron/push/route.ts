import { NextResponse, connection } from "next/server";
import { reminderPayload, sendPush } from "@/lib/push";
import { cronAuthorised, dispatchSetup, NUDGES, nudgeTargets, sendNudges } from "@/lib/push-jobs";

/**
 * Morning push job (Vercel Cron, ~07:00 Trinidad time): today's reminders —
 * bills, tasks, events, budgets, goals — one notification per phone, plus the
 * Sunday money check-in for those who turned it on.
 */
type Pending = { delivery_id: string; user_id: string; endpoint: string; p256dh: string; auth_secret: string; title: string; body: string | null; link_path: string | null };

export async function GET(request: Request) {
  await connection();
  if (!cronAuthorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setup = dispatchSetup();
  if (!setup) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  const { db, token } = setup;

  const { data, error } = await db.rpc("push_pending", { p_token: token });
  if (error) {
    console.error("[cron:push] pending", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Could not load reminders" }, { status: 500 });
  }
  const rows = (data ?? []) as Pending[];

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
  const { error: recordError } = await db.rpc("push_record", {
    p_token: token,
    p_sent: [...sentDeliveries],
    p_failed: [...allDeliveries].filter((id) => !sentDeliveries.has(id)),
    p_gone: gone,
    p_reached: [...reached],
  });
  if (recordError) console.error("[cron:push] record", { code: recordError.code, message: recordError.message });

  // Sundays only (decided in the database, per household time zone).
  const checkin = await nudgeTargets(db, token, "weekly_checkin");
  const checkinResult = checkin ? await sendNudges(db, token, checkin, NUDGES.weekly_checkin) : null;

  return NextResponse.json({ phones: byPhone.size, sent: reached.size, reminders: allDeliveries.size, gone: gone.length, checkin: checkinResult });
}
