import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "@/lib/env";
import { pushConfigured, sendPush, type PushPayload } from "@/lib/push";

/**
 * Shared plumbing for the scheduled push jobs (/api/cron/*). Vercel Cron calls
 * them with `Authorization: Bearer $CRON_SECRET`. They reach the database with
 * the publishable key plus PUSH_DISPATCH_TOKEN, which opens only the
 * push_dispatch functions — never the service role.
 */
export function cronAuthorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function dispatchSetup(): { db: SupabaseClient; token: string } | null {
  const token = process.env.PUSH_DISPATCH_TOKEN;
  if (!token || !pushConfigured()) return null;
  const { url, key } = requireSupabaseConfig();
  return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), token };
}

type Target = { endpoint: string; p256dh: string; auth_secret: string };

/** Send one payload to each phone; forget phones the push service says are gone. */
export async function sendNudges(db: SupabaseClient, token: string, targets: Target[], payload: PushPayload) {
  const reached: string[] = [];
  const gone: string[] = [];
  for (const t of targets) {
    const result = await sendPush({ endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth_secret }, payload);
    if (result === "sent") reached.push(t.endpoint);
    else if (result === "gone") gone.push(t.endpoint);
  }
  if (reached.length || gone.length) {
    const { error } = await db.rpc("push_record", { p_token: token, p_sent: [], p_failed: [], p_gone: gone, p_reached: reached });
    if (error) console.error("[cron:nudges] record", { code: error.code, message: error.message });
  }
  return { phones: targets.length, sent: reached.length, gone: gone.length };
}

/** Phones of people who opted in to a nudge and are due one today. */
export async function nudgeTargets(db: SupabaseClient, token: string, kind: "daily_log" | "weekly_checkin"): Promise<Target[] | null> {
  const { data, error } = await db.rpc("push_nudges", { p_token: token, p_kind: kind });
  if (error) {
    console.error(`[cron:${kind}]`, { code: error.code, message: error.message });
    return null;
  }
  return (data ?? []) as Target[];
}

export const NUDGES = {
  daily_log: {
    title: "Anything to log today?",
    body: "Tap to add what you spent, so your budget stays right.",
    url: "/?add=expense",
    tag: "ward-daily-log",
  },
  weekly_checkin: {
    title: "Sunday money check-in",
    body: "A few minutes: compare your bank balances with Ward Hub and count your wallet.",
    url: "/finances/accounts",
    tag: "ward-weekly-checkin",
  },
} satisfies Record<string, PushPayload>;
