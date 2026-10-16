"use server";

import { z } from "zod";
import { dbErrorMessage, fail, logServerError, ok, type ActionResult } from "@/lib/actions";
import { getActionContext } from "@/lib/auth/context";
import { pushConfigured, sendPush } from "@/lib/push";

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "Invalid push endpoint"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Turn notifications on for this phone (the browser's push subscription). */
export async function savePushSubscription(raw: unknown, userAgent: string): Promise<ActionResult> {
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return fail("This phone gave an unexpected subscription. Please try again.");
  // Notifications may be turned on even by read-only members.
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.rpc("save_push_subscription", {
    p_household_id: ctx.household.id,
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) {
    logServerError("savePushSubscription", error);
    return fail(dbErrorMessage(error, "Couldn't turn on notifications."));
  }
  return ok(null, "Notifications are on for this phone");
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000) return fail("Invalid subscription.");
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  const { error } = await ctx.supabase.from("push_subscriptions").delete().eq("user_id", ctx.userId).eq("endpoint", endpoint);
  if (error) {
    logServerError("removePushSubscription", error);
    return fail(dbErrorMessage(error, "Couldn't turn off notifications."));
  }
  return ok(null, "Notifications are off for this phone");
}

/** Send a test to every phone you've turned on, to check it all works. */
export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
  const auth = await getActionContext({ write: false });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;
  if (!pushConfigured()) return fail("Notifications aren't set up on the server yet.");
  const { data, error } = await ctx.supabase.from("push_subscriptions").select("endpoint, p256dh, auth_secret").eq("user_id", ctx.userId);
  if (error) {
    logServerError("sendTestPush", error);
    return fail("Couldn't find your phones.");
  }
  if (!data.length) return fail("Turn on notifications on this phone first.");
  let sent = 0;
  for (const s of data) {
    const result = await sendPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth_secret },
      { title: "Ward Hub notifications are working", body: "You'll get reminders here each morning when bills or tasks are due.", url: "/settings", tag: "ward-test" },
    );
    if (result === "sent") sent += 1;
    if (result === "gone") await ctx.supabase.from("push_subscriptions").delete().eq("user_id", ctx.userId).eq("endpoint", s.endpoint);
  }
  if (!sent) return fail("The test couldn't reach your phone. Turn notifications off and on again.");
  return ok({ sent }, sent === 1 ? "Test sent — check your phone" : `Test sent to ${sent} phones`);
}
