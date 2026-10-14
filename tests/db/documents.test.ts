import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let otherCategory: string;
let passportCategory: string;

const aal2 = (sub: string) => ({ sub, aal: "aal2" as const });
const sha = "a".repeat(64);

async function catId(household: string, key: string): Promise<string> {
  const r = await db.query<{ id: string }>(`select id from public.document_categories where household_id = $1 and system_key = $2`, [household, key]);
  return r.rows[0].id;
}

async function createDoc(claims: Parameters<typeof asUser>[1], opts: { sensitive?: boolean; expiry?: string; name?: string } = {}) {
  const id = randomUUID();
  await asUser(db, claims, (tx) =>
    tx.query(
      `insert into public.documents (id, household_id, name, category_id, is_sensitive, expiry_date) values ($1, $2, $3, $4, $5, $6)`,
      [id, f.householdA, opts.name ?? "Doc", opts.sensitive ? passportCategory : otherCategory, Boolean(opts.sensitive), opts.expiry ?? null],
    ),
  );
  return id;
}

async function addFile(claims: Parameters<typeof asUser>[1], docId: string) {
  const fileId = randomUUID();
  const path = `${f.householdA}/${docId}/${fileId}`;
  await asUser(db, claims, async (tx) => {
    await tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [path]);
    await tx.query(
      `insert into public.document_files (id, household_id, document_id, version, storage_path, file_name, mime_type, size_bytes, sha256)
       values ($1, $2, $3, 1, $4, 'scan.pdf', 'application/pdf', 1000, $5)`,
      [fileId, f.householdA, docId, path, sha],
    );
    await tx.query(`update public.documents set current_file_id = $1 where id = $2`, [fileId, docId]);
  });
  return { fileId, path };
}

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  otherCategory = await catId(f.householdA, "other");
  passportCategory = await catId(f.householdA, "passports");
});

describe("document vault", () => {
  it("seeds default categories and a private bucket", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.document_categories where household_id = $1`, [f.householdA]);
    expect(r.rows[0].n).toBe(16);
    const b = await db.query<{ public: boolean; file_size_limit: number }>(`select public, file_size_limit from storage.buckets where id = 'documents'`);
    expect(b.rows[0]).toEqual({ public: false, file_size_limit: 26214400 });
  });

  it("shares ordinary documents with the household but not outsiders", async () => {
    const id = await createDoc(f.jonathan, { name: "Car insurance" });
    const { path } = await addFile(f.jonathan, id);
    const seen = await asUser(db, f.adanna, (tx) => tx.query(`select 1 from storage.objects where name = $1`, [path]));
    expect(seen.rows).toHaveLength(1);
    await asUser(db, f.outsider, async (tx) => {
      expect((await tx.query(`select 1 from public.documents where id = $1`, [id])).rows).toHaveLength(0);
      expect((await tx.query(`select 1 from storage.objects where name = $1`, [path])).rows).toHaveLength(0);
    });
  });

  it("requires two-factor verification to add, see or download a sensitive document", async () => {
    await expect(createDoc(f.jonathan, { sensitive: true })).rejects.toThrow(/row-level security/);

    const id = await createDoc(aal2(f.jonathan), { sensitive: true, name: "Jonathan passport" });
    const { path, fileId } = await addFile(aal2(f.jonathan), id);

    await asUser(db, f.adanna, async (tx) => {
      expect((await tx.query(`select 1 from public.documents where id = $1`, [id])).rows).toHaveLength(0);
      expect((await tx.query(`select 1 from public.document_files where id = $1`, [fileId])).rows).toHaveLength(0);
      expect((await tx.query(`select 1 from storage.objects where name = $1`, [path])).rows).toHaveLength(0);
      expect((await tx.query(`delete from public.documents where id = $1`, [id])).affectedRows).toBe(0);
    });
    await asUser(db, aal2(f.adanna), async (tx) => {
      expect((await tx.query(`select 1 from public.documents where id = $1`, [id])).rows).toHaveLength(1);
      expect((await tx.query(`select 1 from storage.objects where name = $1`, [path])).rows).toHaveLength(1);
    });
  });

  it("does not let a session without two-factor mark a document sensitive", async () => {
    const id = await createDoc(f.adanna);
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`update public.documents set is_sensitive = true where id = $1`, [id])),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects uploads outside the caller's household or document", async () => {
    const id = await createDoc(f.jonathan);
    const attempts = [
      `${f.householdB}/${id}/${randomUUID()}`, // another household
      `${f.householdA}/${randomUUID()}/${randomUUID()}`, // no such document
      `${f.householdA}/${id}`, // malformed
      `../${f.householdA}/${id}/${randomUUID()}`, // traversal-looking
    ];
    for (const name of attempts) {
      await expect(
        asUser(db, f.jonathan, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [name])),
        name,
      ).rejects.toThrow(/row-level security/);
    }
    await expect(
      asUser(db, f.viewer, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${f.householdA}/${id}/${randomUUID()}`])),
    ).rejects.toThrow(/row-level security/);
  });

  it("ties file records to their household and document path, and keeps them immutable", async () => {
    const id = await createDoc(f.jonathan);
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(
          `insert into public.document_files (household_id, document_id, version, storage_path, file_name, mime_type, size_bytes, sha256)
           values ($1, $2, 1, $3, 'x.pdf', 'application/pdf', 10, $4)`,
          [f.householdA, id, `${f.householdA}/${randomUUID()}/${randomUUID()}`, sha],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    const { fileId } = await addFile(f.jonathan, id);
    await expect(
      asUser(db, f.jonathan, (tx) => tx.query(`update public.document_files set file_name = 'renamed.pdf' where id = $1`, [fileId])),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(
          `insert into public.document_files (household_id, document_id, version, storage_path, file_name, mime_type, size_bytes, sha256)
           values ($1, $2, 2, $3, 'x.exe', 'application/x-msdownload', 10, $4)`,
          [f.householdA, id, `${f.householdA}/${id}/${randomUUID()}`, sha],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("creates expiry reminders without revealing sensitive document names", async () => {
    await createDoc(f.jonathan, { name: "House insurance policy", expiry: "2026-11-01" });
    await createDoc(aal2(f.jonathan), { sensitive: true, name: "Adanna passport", expiry: "2026-10-30" });
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.refresh_notifications($1, '2026-10-14')`, [f.householdA]));
    const r = await asUser(db, f.adanna, (tx) =>
      tx.query<{ title: string }>(`select title from public.notifications where kind = 'document_expiry' order by title`),
    );
    const titles = r.rows.map((x) => x.title);
    expect(titles).toContain("House insurance policy expires 01/11/2026");
    expect(titles).toContain("A sensitive document expires 30/10/2026");
    expect(titles.some((t) => t.includes("passport"))).toBe(false);
  });

  it("tidies tags", async () => {
    const id = randomUUID();
    await asUser(db, f.jonathan, (tx) =>
      tx.query(`insert into public.documents (id, household_id, name, category_id, tags) values ($1, $2, 'Tagged', $3, $4)`, [
        id,
        f.householdA,
        otherCategory,
        ["  Car ", "car", "", "INSURANCE"],
      ]),
    );
    const r = await db.query<{ tags: string[] }>(`select tags from public.documents where id = $1`, [id]);
    expect(r.rows[0].tags).toEqual(["car", "insurance"]);
  });
});
