import "server-only";
import webpush from "web-push";

/**
 * Web Push sending. The VAPID key pair identifies this app to the browsers'
 * push services: the public key is shared with phones when they subscribe;
 * the private key signs every push and is a server-only secret.
 */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body?: string | null; url?: string | null; tag?: string };

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

let configured = false;
export function pushConfigured(): boolean {
  if (configured) return true;
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://ward-family-hub.vercel.app").replace(/\/$/, "");
  webpush.setVapidDetails(site, publicKey, privateKey);
  configured = true;
  return true;
}

/** "gone" means the phone unsubscribed or the app was removed: forget it. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<"sent" | "gone" | "failed"> {
  if (!pushConfigured()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({ title: payload.title, body: payload.body ?? "", url: payload.url ?? "/notifications", tag: payload.tag }),
      { TTL: 60 * 60 * 12, urgency: "normal" },
    );
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.warn("[push]", { status, message: e instanceof Error ? e.message : String(e) });
    return "failed";
  }
}

type Reminder = { title: string; body: string | null; link_path: string | null };

/** Several reminders for one person become one notification. */
export function reminderPayload(reminders: Reminder[]): PushPayload {
  if (reminders.length === 1) {
    const [r] = reminders;
    return { title: r.title, body: r.body, url: r.link_path ?? "/notifications", tag: "ward-reminders" };
  }
  const lines = reminders.slice(0, 4).map((r) => `• ${r.title}`);
  if (reminders.length > 4) lines.push(`+${reminders.length - 4} more`);
  return { title: `${reminders.length} reminders today`, body: lines.join("\n"), url: "/notifications", tag: "ward-reminders" };
}
