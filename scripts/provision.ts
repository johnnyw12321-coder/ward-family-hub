/**
 * Provision the household and its members. Run locally — never in the browser
 * and never in the deployed app. Requires the Supabase service-role key, which
 * bypasses RLS, so keep it only in .env.local (git-ignored) or your shell.
 *
 *   npm run provision -- \
 *     --household "Ward Family" \
 *     --member "jonathan@example.com:Jonathan:owner" \
 *     --member "adanna@example.com:Adanna:adult"
 *
 * Existing users are linked as-is. New users receive a Supabase invite email
 * whose link lands on /auth/confirm, where they choose a password.
 * Add --dry-run to see what would happen without changing anything.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { normaliseSupabaseUrl } from "../src/lib/env";
import { createClient, type User } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

type MemberSpec = { email: string; name: string; role: "owner" | "adult" | "viewer" };

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    household: { type: "string" },
    member: { type: "string", multiple: true },
    "dry-run": { type: "boolean", default: false },
  },
});

const url = normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
if (!url || !serviceKey) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or your shell).");
if (!values.household) fail('Pass --household "Household name".');
if (!values.member?.length) fail('Pass at least one --member "email:Name:role".');

const members: MemberSpec[] = values.member.map((m) => {
  const [email, name, role = "adult"] = m.split(":");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`Invalid email in "${m}"`);
  if (!name) fail(`Missing name in "${m}"`);
  if (!["owner", "adult", "viewer"].includes(role)) fail(`Role must be owner, adult or viewer in "${m}"`);
  return { email: email.toLowerCase(), name, role: role as MemberSpec["role"] };
});

const dryRun = values["dry-run"];
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(email: string): Promise<User | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`${dryRun ? "[dry run] " : ""}Provisioning "${values.household}" on ${new URL(url!).host}`);

  const { data: existing, error: hhError } = await admin
    .from("households")
    .select("id, name")
    .eq("name", values.household!)
    .limit(2);
  if (hhError) fail(`Could not read households (are the migrations applied?): ${hhError.message}`);
  if ((existing?.length ?? 0) > 1) fail("More than one household has that name; rename one first.");

  let householdId = existing?.[0]?.id as string | undefined;
  if (!householdId) {
    console.log(`• Creating household "${values.household}" (default categories are added automatically)`);
    if (!dryRun) {
      const { data, error } = await admin.from("households").insert({ name: values.household }).select("id").single();
      if (error) fail(`Could not create household: ${error.message}`);
      householdId = data.id as string;
    }
  } else {
    console.log(`• Household exists`);
  }

  for (const m of members) {
    let user = await findUserByEmail(m.email);
    if (!user) {
      console.log(`• Inviting ${m.email} (${m.name}) — they will receive an email to set a password`);
      if (!dryRun) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(m.email, {
          data: { display_name: m.name },
          redirectTo: `${siteUrl}/auth/confirm?next=/update-password`,
        });
        if (error) fail(`Could not invite ${m.email}: ${error.message}`);
        user = data.user;
      }
    } else {
      console.log(`• ${m.email} already has an account`);
    }
    if (dryRun || !user || !householdId) continue;

    const { error: memberError } = await admin
      .from("household_members")
      .upsert(
        { household_id: householdId, user_id: user.id, role: m.role, display_name: m.name },
        { onConflict: "household_id,user_id" },
      );
    if (memberError) fail(`Could not add ${m.email} to the household: ${memberError.message}`);

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: user.id, display_name: m.name, default_household_id: householdId }, { onConflict: "id" });
    if (profileError) fail(`Could not update the profile for ${m.email}: ${profileError.message}`);
    console.log(`  ✓ ${m.name} linked as ${m.role}`);
  }
  console.log(dryRun ? "\nDry run complete — nothing was changed." : "\nDone.");
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
