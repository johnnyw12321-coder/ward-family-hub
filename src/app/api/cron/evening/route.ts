import { NextResponse, connection } from "next/server";
import { cronAuthorised, dispatchSetup, NUDGES, nudgeTargets, sendNudges } from "@/lib/push-jobs";

/**
 * Evening push job (Vercel Cron, ~20:00 Trinidad time): "Anything to log
 * today?" for people who turned it on and haven't recorded anything today.
 */
export async function GET(request: Request) {
  await connection();
  if (!cronAuthorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setup = dispatchSetup();
  if (!setup) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  const targets = await nudgeTargets(setup.db, setup.token, "daily_log");
  if (!targets) return NextResponse.json({ error: "Could not load reminders" }, { status: 500 });
  return NextResponse.json(await sendNudges(setup.db, setup.token, targets, NUDGES.daily_log));
}
