# Chapter 22 — Database Migrations

## What You'll Learn

This chapter explains how D1 schema changes are managed, how to safely apply incremental migrations to a production database, and where to find each migration file.

---

## 22.1 Why Migrations Exist

`worker/schema.sql` is the **canonical full schema** — it defines all tables, indexes, and seed data for a fresh database. It is safe to run against an empty D1 instance.

However, it cannot be re-run against an existing production database. The reason is that `schema.sql` includes `ALTER TABLE` statements (for adding columns to existing tables), and SQLite/D1 does not support `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Running `schema.sql` against a database that already has those columns will fail with:

```
Error: table users already has column totp_secret
```

To apply schema changes to an already-running production database, **migration files** are used. Each migration file contains only the delta — the new tables and columns added since the last deployment.

---

## 22.2 Migration File Conventions

Migration files live in `worker/migrations/`. Naming convention:

```
{number}-{from-version}-to-{to-version}.sql
```

Example: `002-v0.2.9-to-v0.2.19.sql`

Rules:
- Every statement uses `CREATE TABLE IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS` — migrations are **idempotent** and safe to re-run.
- `ALTER TABLE` statements are only in `schema.sql` (run once on a fresh DB). Migrations use only `CREATE TABLE/INDEX IF NOT EXISTS`.
- Each file's header comment documents exactly which version it applies from/to and what feature each block belongs to.

---

## 22.3 Migration History

### Migration 001 — Initial schema (v0.2.0)

**File:** `worker/schema.sql` (applied to fresh DB only)

Applied once when the D1 database was first created. Contains all base tables and the `ALTER TABLE` statements that were written incrementally during development.

---

### Migration 002 — v0.2.8 → v0.2.19

**File:** `worker/migrations/002-v0.2.9-to-v0.2.19.sql`

**Apply with:**
```bash
npx wrangler d1 execute varun-portfolio-auth --remote \
  --file=worker/migrations/002-v0.2.9-to-v0.2.19.sql
```

**Safe to run against:** any production DB last migrated at v0.2.8.

| Block | Version introduced | Feature |
|---|---|---|
| `endpoint_logs` table + 2 indexes | v0.2.9 | Admin dashboard: request volume tracking per endpoint |
| `trusted_devices` table + 2 indexes | v0.2.14 | Persistent device trust to skip sign-in verification prompt |
| `feedback` table | v0.2.19 | Anonymous feedback widget submissions |

**Why these three are `CREATE TABLE IF NOT EXISTS` safe:**
None of these blocks use `ALTER TABLE`. They are entirely new tables. Running the migration twice will silently no-op on the second run.

---

## 22.4 How to Apply a Migration to Production

```bash
# 1. Authenticate wrangler (if not already)
npx wrangler login

# 2. Apply the migration
npx wrangler d1 execute varun-portfolio-auth --remote \
  --file=worker/migrations/002-v0.2.9-to-v0.2.19.sql

# 3. Verify the tables exist
npx wrangler d1 execute varun-portfolio-auth --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# 4. Deploy the worker code
npx wrangler deploy
```

Always apply the migration **before** deploying the Worker code that depends on the new tables. Deploying the Worker first will cause 500 errors until the schema is updated.

---

## 22.5 How to Apply the Schema to a Fresh Database

For a brand new D1 instance (local dev setup or starting from scratch in a new Cloudflare account):

```bash
# Apply the full schema — safe only on an empty database
npx wrangler d1 execute varun-portfolio-auth --remote --file=worker/schema.sql

# For local dev
npx wrangler d1 execute varun-portfolio-auth --local --file=worker/schema.sql
```

Do **not** run `schema.sql` against an existing production database. Use the migration files instead.

---

## 22.6 How to Write a New Migration

When a new table or column is added during development:

1. **Add it to `schema.sql`** — keep `schema.sql` as the source of truth for fresh setups.
   - New tables: add a `CREATE TABLE IF NOT EXISTS` block.
   - New columns: add an `ALTER TABLE ... ADD COLUMN` at the bottom of `schema.sql` (under a version comment).

2. **Create a new migration file** in `worker/migrations/`:
   - Name it `{N+1}-v{prev-version}-to-v{new-version}.sql`
   - Include only the delta (new tables/indexes). Use `CREATE TABLE IF NOT EXISTS`.
   - Add a header comment documenting what version range it covers and what each block adds.

3. **Document it in this chapter** (section 22.3) with the version, file path, apply command, and a table of changes.

4. **Apply it to prod** after deployment using the apply steps in section 22.4.

---

## 22.7 Checking What Tables Exist in Production

```bash
# List all tables
npx wrangler d1 execute varun-portfolio-auth --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Check columns on a specific table
npx wrangler d1 execute varun-portfolio-auth --remote \
  --command="PRAGMA table_info(users);"

# Count rows in a table (sanity check before migration)
npx wrangler d1 execute varun-portfolio-auth --remote \
  --command="SELECT COUNT(*) FROM endpoint_logs;"
```

---

## Key Takeaways

- `schema.sql` is for **fresh databases only**. Never re-run it against production.
- Migration files in `worker/migrations/` are the safe way to update a live database.
- All migration statements use `CREATE TABLE IF NOT EXISTS` — they are idempotent.
- Always migrate **before** deploying Worker code that depends on the new schema.
- Document every migration in section 22.3 of this chapter immediately when it is created.
