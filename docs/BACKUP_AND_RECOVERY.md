# Backup and recovery

Three layers, from most to least automatic.

## 1. Supabase platform backups

- Paid Supabase plans take **daily backups** automatically (Pro keeps 7 days).
- **Point-in-time recovery (PITR)** is an add-on that lets you restore to any
  second within the retention window. Recommended once you rely on the app daily.
- Free projects are paused after inactivity and have no downloadable backups —
  use layers 2 and 3.
- Restore: Supabase Dashboard → Database → Backups → choose a backup → Restore.
  This replaces the whole database, so download a fresh export (layer 2) first.

## 2. Owner-run JSON backup (recommended monthly)

```bash
npm run backup
```

Writes `backups/ward-hub-<timestamp>.json` with every household table
(git-ignored). It uses the service-role key, so run it only on a trusted
computer. Store the file encrypted (e.g. an encrypted disk image, or attached to
a secure note in a password manager), and keep at least one copy off the computer.

The same data (for the signed-in household) is available in the app:
**Settings → Your data → Full backup (JSON)**, and transactions as CSV.

## 3. Database dump (complete, including functions)

With the Supabase CLI and the database password:

```bash
npx supabase db dump --linked -f backups/schema.sql
npx supabase db dump --linked --data-only -f backups/data.sql
```

## Restoring from a JSON backup

The JSON format is `{ format, version, exported_at, tables: { <table>: rows[] } }`,
with tables listed parents-first. Amounts are integer cents.

1. Create a fresh Supabase project and apply all migrations.
2. Provision the members (`npm run provision`) so `auth.users` exist. User ids
   will differ from the backup; map old ids to new ones by email.
3. With the service role, insert tables in the listed order, replacing old user
   ids in `user_id`, `*_by`, `person_user_id`, `assigned_user_id` and
   `owner_user_id` columns. Insert `transactions` and `transaction_entries` in one
   database transaction (the ledger check runs at commit).
4. Skip `households` default categories: either delete the seeded categories
   before inserting the backup's, or insert the backup's household row first with
   the seed trigger disabled.

A scripted restore tool is on the roadmap; until then, do restores carefully and
test them on a separate project first.

## Documents (Phase 4)

Uploaded documents will live in a private Storage bucket. Backups of files are
separate from the database: the backup script will be extended to download the
bucket, and the restore steps to upload it.

## What is never backed up by the app

Passwords and session tokens (managed by Supabase Auth). Users reset their
password after a restore to a new project.
