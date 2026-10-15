import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, seedHouseholds, type Fixture } from "./harness";

let db: PGlite;
let f: Fixture;
let bag: string; // on Adanna's list
let childId: string;

const count = async (user: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, user, (tx) => tx.query(sql, params))).rows.length;

beforeAll(async () => {
  db = await createTestDb();
  f = await seedHouseholds(db);
  childId = (
    await db.query<{ id: string }>(`insert into public.family_members (household_id, full_name, relationship) values ($1, 'Baby Ward', 'child') returning id`, [
      f.householdA,
    ])
  ).rows[0].id;
  bag = await asUser(db, f.adanna, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.wish_items (household_id, owner_user_id, title, store, price_minor, priority)
       values ($1, $2, 'Tan leather bag', 'Long Circular Mall', 85000, 'love') returning id`,
      [f.householdA, f.adanna],
    );
    return r.rows[0].id;
  });
});

describe("wishlists", () => {
  it("shares a member's list with the household only", async () => {
    expect(await count(f.jonathan, `select 1 from public.wish_items where id = $1`, [bag])).toBe(1);
    expect(await count(f.outsider, `select 1 from public.wish_items`)).toBe(0);
  });

  it("hides claims on your own list from you", async () => {
    await asUser(db, f.jonathan, (tx) => tx.query(`insert into public.wish_claims (household_id, item_id, occasion) values ($1, $2, 'birthday')`, [f.householdA, bag]));
    expect(await count(f.jonathan, `select 1 from public.wish_claims where item_id = $1`, [bag])).toBe(1);
    expect(await count(f.adanna, `select 1 from public.wish_claims`)).toBe(0);
  });

  it("doesn't let you claim from your own list", async () => {
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`insert into public.wish_claims (household_id, item_id) values ($1, $2)`, [f.householdA, bag])),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets others add only surprises to your list, and hides them and their claims from you", async () => {
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(`insert into public.wish_items (household_id, owner_user_id, title) values ($1, $2, 'Not a surprise')`, [f.householdA, f.adanna]),
      ),
    ).rejects.toThrow(/row-level security/);
    const surprise = await asUser(db, f.jonathan, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.wish_items (household_id, owner_user_id, title, is_surprise) values ($1, $2, 'Spa day', true) returning id`,
        [f.householdA, f.adanna],
      );
      await tx.query(`insert into public.wish_claims (household_id, item_id, occasion) values ($1, $2, 'anniversary')`, [f.householdA, r.rows[0].id]);
      return r.rows[0].id;
    });
    expect(await count(f.adanna, `select 1 from public.wish_items where id = $1`, [surprise])).toBe(0);
    expect(await count(f.adanna, `select 1 from public.wish_claims`)).toBe(0);
    expect(await count(f.jonathan, `select 1 from public.wish_items where id = $1`, [surprise])).toBe(1);
  });

  it("lets only the owner edit their own items", async () => {
    expect(await count(f.jonathan, `update public.wish_items set price_minor = 1 where id = $1 returning id`, [bag])).toBe(0);
    expect(await count(f.adanna, `update public.wish_items set price_minor = 90000 where id = $1 returning id`, [bag])).toBe(1);
    // Nor can the owner turn their own item into a "surprise" to hide it.
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`update public.wish_items set is_surprise = true where id = $1`, [bag])),
    ).rejects.toThrow(/row-level security/);
  });

  it("shares a child's list, claims included, between the adults", async () => {
    const toy = await asUser(db, f.jonathan, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.wish_items (household_id, family_member_id, title) values ($1, $2, 'Wooden train set') returning id`,
        [f.householdA, childId],
      );
      return r.rows[0].id;
    });
    await asUser(db, f.adanna, (tx) => tx.query(`insert into public.wish_claims (household_id, item_id, occasion) values ($1, $2, 'christmas')`, [f.householdA, toy]));
    expect(await count(f.jonathan, `select 1 from public.wish_claims where item_id = $1`, [toy])).toBe(1);
    // Only the person who claimed it can change the claim.
    expect(await count(f.jonathan, `update public.wish_claims set status = 'bought' where item_id = $1 returning id`, [toy])).toBe(0);
    expect(await count(f.adanna, `update public.wish_claims set status = 'bought' where item_id = $1 returning id`, [toy])).toBe(1);
  });

  it("is read-only for viewers", async () => {
    await expect(
      asUser(db, f.viewer, (tx) => tx.query(`insert into public.wish_claims (household_id, item_id) values ($1, $2)`, [f.householdA, bag])),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps a surprise's photo as hidden as the surprise", async () => {
    const fileId = "0f0f0f0f-0000-4000-8000-000000000001";
    const surprise = await asUser(db, f.jonathan, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `insert into public.wish_items (household_id, owner_user_id, title, is_surprise) values ($1, $2, 'Gold bangle', true) returning id`,
        [f.householdA, f.adanna],
      );
      const path = `${f.householdA}/${r.rows[0].id}/${fileId}`;
      await tx.query(`insert into storage.objects (bucket_id, name) values ('wishlist', $1)`, [path]);
      return r.rows[0].id;
    });
    const path = `${f.householdA}/${surprise}/${fileId}`;
    expect(await count(f.jonathan, `select 1 from storage.objects where name = $1`, [path])).toBe(1);
    expect(await count(f.adanna, `select 1 from storage.objects where name = $1`, [path])).toBe(0);
    expect(await count(f.outsider, `select 1 from storage.objects where name = $1`, [path])).toBe(0);
  });

  it("lets only the people who can edit an item set its photo", async () => {
    const own = `${f.householdA}/${bag}/0f0f0f0f-0000-4000-8000-000000000002`;
    await asUser(db, f.adanna, async (tx) => {
      await tx.query(`insert into storage.objects (bucket_id, name) values ('wishlist', $1)`, [own]);
      await tx.query(`update public.wish_items set image_path = $1, image_source = 'photo' where id = $2`, [own, bag]);
    });
    // Her list is shared, so Jonathan can see her photo but can't swap it.
    expect(await count(f.jonathan, `select 1 from storage.objects where name = $1`, [own])).toBe(1);
    expect(await count(f.jonathan, `update public.wish_items set image_path = null, image_source = null where id = $1 returning id`, [bag])).toBe(0);
  });

  it("lets anyone who can see an item fill in its link preview, and nothing else", async () => {
    const link = "https://shop.example.tt/watch";
    const watch = await asUser(db, f.adanna, async (tx) =>
      (
        await tx.query<{ id: string }>(`insert into public.wish_items (household_id, owner_user_id, title, link_url) values ($1, $2, 'Watch', $3) returning id`, [
          f.householdA,
          f.adanna,
          link,
        ])
      ).rows[0].id,
    );
    const picture = `${f.householdA}/${watch}/0f0f0f0f-0000-4000-8000-000000000003`;
    // Jonathan opens her list: the picture is copied in and the preview attached.
    await asUser(db, f.jonathan, async (tx) => {
      await tx.query(`insert into storage.objects (bucket_id, name) values ('wishlist', $1)`, [picture]);
      await tx.query(`select public.save_wish_link_preview($1, $2, $3, 'Steel watch', 'Shop TT', $4)`, [f.householdA, watch, link, picture]);
    });
    const r = await db.query<{ link_title: string; image_source: string; title: string; checked: boolean }>(
      `select link_title, image_source, title, link_checked_at is not null as checked from public.wish_items where id = $1`,
      [watch],
    );
    expect(r.rows[0]).toEqual({ link_title: "Steel watch", image_source: "link", title: "Watch", checked: true });

    // It never replaces a photo someone took.
    const photo = `${f.householdA}/${bag}/0f0f0f0f-0000-4000-8000-000000000002`;
    await db.query(`update public.wish_items set link_url = $1 where id = $2`, [link, bag]);
    const linkPicture = `${f.householdA}/${bag}/0f0f0f0f-0000-4000-8000-000000000005`;
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.save_wish_link_preview($1, $2, $3, 'x', 'y', $4)`, [f.householdA, bag, link, linkPicture]));
    expect((await db.query<{ image_path: string }>(`select image_path from public.wish_items where id = $1`, [bag])).rows[0].image_path).toBe(photo);

    // A stale link is ignored, and pictures must live in the item's own folder.
    await asUser(db, f.jonathan, (tx) => tx.query(`select public.save_wish_link_preview($1, $2, 'https://old.example', 'Old', 'Old', null)`, [f.householdA, watch]));
    expect((await db.query<{ link_title: string }>(`select link_title from public.wish_items where id = $1`, [watch])).rows[0].link_title).toBe("Steel watch");
    await expect(
      asUser(db, f.jonathan, (tx) =>
        tx.query(`select public.save_wish_link_preview($1, $2, $3, 'x', 'y', $4)`, [f.householdA, watch, link, `${f.householdA}/${bag}/0f0f0f0f-0000-4000-8000-000000000009`]),
      ),
    ).rejects.toThrow(/Invalid picture/);
    // Outsiders and viewers can't use it at all.
    await expect(
      asUser(db, f.outsider, (tx) => tx.query(`select public.save_wish_link_preview($1, $2, $3, 'x', 'y', null)`, [f.householdA, watch, link])),
    ).rejects.toThrow(/permission/);
    await expect(
      asUser(db, f.viewer, (tx) => tx.query(`select public.save_wish_link_preview($1, $2, $3, 'x', 'y', null)`, [f.householdA, watch, link])),
    ).rejects.toThrow(/permission/);
  });

  it("won't reveal or touch a surprise for its recipient through the preview function", async () => {
    const link = "https://shop.example.tt/ring";
    const ring = await asUser(db, f.jonathan, async (tx) =>
      (
        await tx.query<{ id: string }>(
          `insert into public.wish_items (household_id, owner_user_id, title, link_url, is_surprise) values ($1, $2, 'Ring', $3, true) returning id`,
          [f.householdA, f.adanna, link],
        )
      ).rows[0].id,
    );
    await expect(
      asUser(db, f.adanna, (tx) => tx.query(`select public.save_wish_link_preview($1, $2, $3, 'x', 'y', null)`, [f.householdA, ring, link])),
    ).rejects.toThrow(/no longer exists/);
    await expect(
      asUser(db, f.adanna, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('wishlist', $1)`, [`${f.householdA}/${ring}/0f0f0f0f-0000-4000-8000-000000000004`]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("only accepts web links", async () => {
    await expect(
      asUser(db, f.adanna, (tx) =>
        tx.query(`insert into public.wish_items (household_id, owner_user_id, title, link_url) values ($1, $2, 'x', 'javascript:alert(1)')`, [
          f.householdA,
          f.adanna,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
