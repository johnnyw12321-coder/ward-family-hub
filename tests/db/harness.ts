/**
 * In-process PostgreSQL (PGlite) harness for testing migrations and RLS.
 *
 * It recreates the parts of Supabase the migrations depend on:
 *   - roles anon / authenticated / service_role (service_role bypasses RLS)
 *   - Supabase's default grants on the public schema (ALL to anon and
 *     authenticated), so tests prove our migrations revoke what they must
 *   - auth.users, auth.uid(), auth.jwt() driven by request.jwt.claims
 *   - a minimal storage schema (buckets/objects/foldername)
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const SUPABASE_STUB = /* sql */ `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

export type Claims = { sub: string; aal?: "aal1" | "aal2"; role?: string };

/** Run `fn` inside a transaction as an authenticated user (RLS enforced). */
export async function asUser<T>(
  db: PGlite,
  claims: Claims | string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const c: Claims = typeof claims === "string" ? { sub: claims, aal: "aal1" } : claims;
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: "authenticated", aal: "aal1", ...c }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

/** Run `fn` as the anon role (no user). */
export async function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await tx.exec("set local role anon");
    return fn(tx);
  });
}

export type Fixture = {
  householdA: string;
  householdB: string;
  jonathan: string;
  adanna: string;
  outsider: string;
  viewer: string;
};

/** Provision two households the way scripts/provision.ts does (as superuser). */
export async function seedHouseholds(db: PGlite): Promise<Fixture> {
  const insertUser = async (email: string, name: string) =>
    (
      await db.query<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
        [email, JSON.stringify({ display_name: name })],
      )
    ).rows[0].id;

  const jonathan = await insertUser("jonathan@example.test", "Jonathan");
  const adanna = await insertUser("adanna@example.test", "Adanna");
  const outsider = await insertUser("outsider@example.test", "Outsider");
  const viewer = await insertUser("viewer@example.test", "Viewer");

  const householdA = (
    await db.query<{ id: string }>(`insert into public.households (name) values ('Ward Family') returning id`)
  ).rows[0].id;
  const householdB = (
    await db.query<{ id: string }>(`insert into public.households (name) values ('Other Family') returning id`)
  ).rows[0].id;

  await db.query(
    `insert into public.household_members (household_id, user_id, role, display_name) values
       ($1, $2, 'owner', 'Jonathan'), ($1, $3, 'adult', 'Adanna'), ($1, $5, 'viewer', 'Viewer'),
       ($4, $6, 'owner', 'Outsider')`,
    [householdA, jonathan, adanna, householdB, viewer, outsider],
  );
  return { householdA, householdB, jonathan, adanna, outsider, viewer };
}

export async function categoryId(db: PGlite, householdId: string, name: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `select id from public.transaction_categories where household_id = $1 and name = $2`,
    [householdId, name],
  );
  if (!res.rows[0]) throw new Error(`Category ${name} not found`);
  return res.rows[0].id;
}
