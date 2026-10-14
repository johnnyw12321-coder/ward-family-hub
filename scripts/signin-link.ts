/**
 * Print a one-time "set your password" link for an existing household member,
 * without sending email. Use it when invite emails don't arrive (for example
 * before custom SMTP is set up). Run locally only — it uses the service-role key.
 *
 *   npm run signin-link -- --email jonathan@example.com
 *   npm run signin-link -- --email adanna@example.com --site https://your-app.vercel.app
 *
 * The link works once and expires (Supabase default: 1 hour). Treat it like a
 * password: open it yourself or hand it only to that person.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { normaliseSupabaseUrl } from "../src/lib/env";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({ options: { email: { type: "string" }, site: { type: "string" } } });
const url = normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (values.site ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!/^https?:\/\/[^/]+$/.test(siteUrl)) fail("--site must be just the address, e.g. https://your-app.vercel.app");
if (!url || !serviceKey) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
const email = values.email?.trim().toLowerCase() ?? "";
if (!email) fail('Pass --email "someone@example.com".');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  // Only members who were provisioned can get a link.
  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) fail(`Could not list users: ${listError.message}`);
  const user = users.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) fail(`${email} has no account. Run npm run provision first.`);
  const { data: member } = await admin.from("household_members").select("display_name").eq("user_id", user.id).maybeSingle();
  if (!member) fail(`${email} isn't linked to a household. Run npm run provision first.`);

  // A recovery link verifies the address and lands on /update-password.
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.hashed_token) fail(`Could not create a link: ${error?.message ?? "unknown error"}`);

  const link = `${siteUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`;
  console.log(`\nOne-time link for ${member.display_name} (${email}):\n\n${link}\n`);
  console.log("It works once and expires within about an hour. Open it on a device that can reach " + siteUrl + ".\n");
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
