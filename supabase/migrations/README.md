# Supabase migrations

SQL migrations for the Highlight Clips database. This project applies them **by
hand through the Supabase Dashboard SQL Editor** (no Supabase CLI). The files are
kept here for version history and so the schema is reviewable in pull requests.

## Applying a migration

1. Open the project dashboard → **SQL Editor** → **New query**.
2. Paste the contents of the next unapplied file (in numeric order).
3. Run it. Each file is written to succeed as a single run.
4. Record that it ran (see the checklist below).

Files are ordered and are **not** idempotent as a whole — run each one once, in
order. Re-running `0001_schema.sql` will error on `create table` (that's
expected; it means it already ran).

## One-time: reset the prototype schema

`0000_reset_prototype.sql` removes an earlier athlete-centric prototype (`games`
without a `slug`, plus `athletes` / `clips` / `purchases`) that was created in
this project before the approved schema. Run it **once, before `0001`**.

First confirm the prototype tables are empty:

```sql
select
  coalesce((select count(*) from public.games),     0) as games,
  coalesce((select count(*) from public.clips),     0) as clips,
  coalesce((select count(*) from public.athletes),  0) as athletes,
  coalesce((select count(*) from public.purchases), 0) as purchases;
```

If every count is `0`, run `0000_reset_prototype.sql` (it also self-aborts if any
of those tables still hold rows). On a fresh project this file is a no-op.

## Migration log

| File | Applied on | By |
| --- | --- | --- |
| `0000_reset_prototype.sql` | _pending_ | |
| `0001_schema.sql` | _pending_ | |
| `0002_rls.sql` | _pending_ | |
| `0003_storage.sql` | _pending_ | |
| `0004_seed.sql` | _pending_ | |

## Layer 1 contents

- **`0001_schema.sql`** — `citext` extension; `set_updated_at()` and
  `clips_check_relations()` trigger functions; tables `settings`, `games`,
  `teams`, `categories`, `clips`, `orders`, `order_items`, `edit_requests`,
  `admin_users`, `cleanup_log`; `is_admin()`; indexes and `updated_at` triggers.
- **`0002_rls.sql`** — enables RLS on every table; revokes latent privileges on
  sensitive tables; column-level `select` grant on `clips` (never
  `original_path`); public read policies gated on active, in-window games;
  admin-only policies via `is_admin()`; the `public_clips` view.
- **`0003_storage.sql`** — buckets `originals`, `previews`, `posters` (private)
  and `public-assets` (public).
- **`0004_seed.sql`** — inserts the single `settings` row with defaults:
  clip $5.00, bulk 5+ → 25% off, personal edit $100.00, download window 72 h,
  game duration 18 days, USD.

## Not in Layer 1

The admin bootstrap runs in **Layer 3**, after the first magic-link sign-in
creates an `auth.users` row:

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users where email = 'brytonsmith8@gmail.com'
on conflict do nothing;
```
