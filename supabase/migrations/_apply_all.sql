-- ============================================================================
-- _apply_all.sql — Layer 1, one-shot apply for the Supabase SQL Editor.
--
-- This is the concatenation of 0000_reset_prototype.sql .. 0004_seed.sql, in
-- order. The numbered files remain the source of truth; this exists so the
-- whole of Layer 1 can be pasted and run once. The SQL Editor runs it as a
-- single transaction: if any statement errors, nothing is applied.
--
-- After a successful run, re-run:
--   select table_name from information_schema.tables
--   where table_schema = 'public' order by table_name;
-- Expect: admin_users, categories, cleanup_log, clips, edit_requests, games,
--         order_items, orders, settings, teams  (athletes/purchases gone).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0000_reset_prototype.sql
-- ----------------------------------------------------------------------------

-- Layer 1 · 0000_reset_prototype.sql
--
-- ONE-TIME, DESTRUCTIVE cleanup for the Supabase project rtnucytxpbwvkzsauwbr.
--
-- Before the approved schema was applied, an earlier athlete-centric prototype
-- (games without a slug, plus athletes / clips / purchases) was created in this
-- project. Those tables conflict with 0001_schema.sql. This script drops them so
-- the approved migrations apply cleanly.
--
-- On a fresh project these tables do not exist and every statement is a no-op.
--
-- SAFETY: run the count check first (see supabase/migrations/README.md). This
-- script aborts if any prototype table still holds rows, so pasting it can't
-- silently delete real data.

do $$
declare
  n_games     bigint := 0;
  n_clips     bigint := 0;
  n_athletes  bigint := 0;
  n_purchases bigint := 0;
begin
  if to_regclass('public.games')     is not null then execute 'select count(*) from public.games'     into n_games;     end if;
  if to_regclass('public.clips')     is not null then execute 'select count(*) from public.clips'     into n_clips;     end if;
  if to_regclass('public.athletes')  is not null then execute 'select count(*) from public.athletes'  into n_athletes;  end if;
  if to_regclass('public.purchases') is not null then execute 'select count(*) from public.purchases' into n_purchases; end if;

  if n_games + n_clips + n_athletes + n_purchases > 0 then
    raise exception
      'Prototype tables are not empty (games=%, clips=%, athletes=%, purchases=%). Aborting reset. Export or migrate that data first, then drop the tables manually.',
      n_games, n_clips, n_athletes, n_purchases;
  end if;
end
$$;

drop table if exists public.purchases cascade;
drop table if exists public.clips     cascade;
drop table if exists public.athletes  cascade;
drop table if exists public.games     cascade;

-- ----------------------------------------------------------------------------
-- 0001_schema.sql
-- ----------------------------------------------------------------------------

-- Layer 1 · 0001_schema.sql — extensions, helpers, tables, constraints, triggers, indexes

create extension if not exists citext with schema extensions;

-- keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

-- ── settings — single configurable row (id forced to 1) ──────────────────────
create table public.settings (
  id                          smallint     primary key default 1 check (id = 1),
  clip_default_price_cents    integer      not null default 500   check (clip_default_price_cents >= 0),
  currency                    text         not null default 'usd',
  bulk_discount_threshold     integer      not null default 5     check (bulk_discount_threshold >= 1),
  bulk_discount_percent       numeric(5,2) not null default 25    check (bulk_discount_percent between 0 and 100),
  personal_edit_price_cents   integer      not null default 10000 check (personal_edit_price_cents >= 0),
  download_window_hours       integer      not null default 72    check (download_window_hours >= 1),
  game_default_duration_days  integer      not null default 18    check (game_default_duration_days >= 1),
  updated_at                  timestamptz  not null default now()
);
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ── games ───────────────────────────────────────────────────────────────────
create table public.games (
  id         uuid        primary key default gen_random_uuid(),
  slug       text        not null unique,
  title      text        not null,
  sport      text        not null,
  game_date  date        not null,
  publish_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status     text        not null default 'draft' check (status in ('draft','active','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > publish_at)
);
create index games_status_expires_idx on public.games (status, expires_at);
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();

-- ── teams (per game) ────────────────────────────────────────────────────────
create table public.teams (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        not null references public.games(id) on delete cascade,
  name       text        not null,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, name)
);
create index teams_game_idx on public.teams (game_id);

-- ── categories (per game) ───────────────────────────────────────────────────
create table public.categories (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        not null references public.games(id) on delete cascade,
  name       text        not null,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, name)
);
create index categories_game_idx on public.categories (game_id);

-- ── clips ───────────────────────────────────────────────────────────────────
create table public.clips (
  id                  uuid        primary key default gen_random_uuid(),
  game_id             uuid        not null references public.games(id)      on delete cascade,
  team_id             uuid        not null references public.teams(id)      on delete restrict,
  category_id         uuid        not null references public.categories(id) on delete restrict,
  jersey_number       text,
  description         text,
  price_cents         integer     check (price_cents is null or price_cents >= 0),
  duration_seconds    integer     check (duration_seconds is null or duration_seconds > 0),
  preview_path        text,
  original_path       text,
  poster_path         text,
  source              text        not null default 'manual' check (source in ('manual','ai')),
  review_status       text        not null default 'pending' check (review_status in ('pending','approved','rejected')),
  published           boolean     not null default false,
  original_deleted_at timestamptz,
  preview_deleted_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint clips_publishable check (
    not published
    or (review_status = 'approved' and preview_path is not null and original_path is not null)
  )
);
create index clips_game_idx     on public.clips (game_id);
create index clips_team_idx     on public.clips (team_id);
create index clips_category_idx on public.clips (category_id);
create index clips_review_idx   on public.clips (review_status, published);
create trigger clips_set_updated_at before update on public.clips
  for each row execute function public.set_updated_at();

-- team & category must belong to the clip's game
create or replace function public.clips_check_relations()
returns trigger language plpgsql as $$
declare t_game uuid; c_game uuid;
begin
  select game_id into t_game from public.teams      where id = new.team_id;
  select game_id into c_game from public.categories where id = new.category_id;
  if t_game is distinct from new.game_id then
    raise exception 'team % is not in game %', new.team_id, new.game_id;
  end if;
  if c_game is distinct from new.game_id then
    raise exception 'category % is not in game %', new.category_id, new.game_id;
  end if;
  return new;
end;
$$;
create trigger clips_check_relations before insert or update on public.clips
  for each row execute function public.clips_check_relations();

-- ── orders ──────────────────────────────────────────────────────────────────
create table public.orders (
  id                         uuid         primary key default gen_random_uuid(),
  access_token               text         not null unique,   -- 32 random bytes, base64url, set by the app
  customer_email             citext       not null,
  status                     text         not null default 'pending' check (status in ('pending','paid','canceled')),
  currency                   text         not null default 'usd',
  subtotal_cents             integer      not null default 0 check (subtotal_cents  >= 0),
  discount_percent           numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_cents             integer      not null default 0 check (discount_cents  >= 0),
  total_cents                integer      not null default 0 check (total_cents     >= 0),
  stripe_checkout_session_id text         unique,
  stripe_payment_intent_id   text,
  paid_at                    timestamptz,
  download_expires_at        timestamptz,
  created_at                 timestamptz  not null default now(),
  updated_at                 timestamptz  not null default now(),
  constraint orders_paid_fields check (
    status <> 'paid' or (paid_at is not null and download_expires_at is not null)
  )
);
create index orders_token_idx        on public.orders (access_token);
create index orders_status_dlexp_idx on public.orders (status, download_expires_at);
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ── order_items ─────────────────────────────────────────────────────────────
create table public.order_items (
  id                 uuid        primary key default gen_random_uuid(),
  order_id           uuid        not null references public.orders(id) on delete cascade,
  clip_id            uuid        references public.clips(id) on delete set null,
  unit_price_cents   integer     not null check (unit_price_cents >= 0),
  snapshot           jsonb       not null default '{}'::jsonb,   -- game/team/category/jersey/date; survives clip purge
  download_count     integer     not null default 0,
  last_downloaded_at timestamptz,
  created_at         timestamptz not null default now(),
  unique (order_id, clip_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_clip_idx  on public.order_items (clip_id);

-- ── edit_requests (personal highlight edit — a request, not a purchase) ──────
create table public.edit_requests (
  id                 uuid        primary key default gen_random_uuid(),
  order_id           uuid        references public.orders(id) on delete set null,
  customer_name      text        not null,
  customer_email     citext      not null,
  athlete_name       text,
  sport              text,
  school_team        text,
  instructions       text,
  quoted_price_cents integer     check (quoted_price_cents is null or quoted_price_cents >= 0),
  status             text        not null default 'new' check (status in ('new','in_progress','done','canceled')),
  admin_notes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index edit_requests_status_idx on public.edit_requests (status);
create trigger edit_requests_set_updated_at before update on public.edit_requests
  for each row execute function public.set_updated_at();

-- ── admin_users + is_admin() ────────────────────────────────────────────────
create table public.admin_users (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  email      citext      not null,
  created_at timestamptz not null default now()
);
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ── cleanup_log (ops visibility for the Layer 6 daily job) ──────────────────
create table public.cleanup_log (
  id                uuid        primary key default gen_random_uuid(),
  ran_at            timestamptz not null default now(),
  games_expired     integer     not null default 0,
  originals_deleted integer     not null default 0,
  previews_deleted  integer     not null default 0,
  details           jsonb       not null default '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- 0002_rls.sql
-- ----------------------------------------------------------------------------

-- Layer 1 · 0002_rls.sql — RLS, privilege lock-downs, public read policies, safe view

alter table public.settings      enable row level security;
alter table public.games         enable row level security;
alter table public.teams         enable row level security;
alter table public.categories    enable row level security;
alter table public.clips         enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.edit_requests enable row level security;
alter table public.admin_users   enable row level security;
alter table public.cleanup_log   enable row level security;

-- Strip latent table privileges on sensitive data. RLS already blocks anon/
-- authenticated; this removes the underlying grant too, so a future mistaken
-- policy still can't leak them. service_role has BYPASSRLS and keeps full access.
revoke all on public.orders        from anon, authenticated;
revoke all on public.order_items   from anon, authenticated;
revoke all on public.edit_requests from anon, authenticated;
revoke all on public.clips         from anon, authenticated;
revoke all on public.admin_users   from anon;

-- The public may read ONLY these columns of clips (never original_path).
grant select
  (id, game_id, team_id, category_id, jersey_number, description,
   duration_seconds, preview_path, poster_path, price_cents,
   source, review_status, published, original_deleted_at, preview_deleted_at)
  on public.clips to anon, authenticated;

-- ── public read policies ───────────────────────────────────────────────────
create policy settings_public_read on public.settings
  for select to anon, authenticated using (true);   -- prices / discount rules are public

create policy games_public_read on public.games
  for select to anon, authenticated
  using (status = 'active' and now() >= publish_at and now() < expires_at);

create policy teams_public_read on public.teams
  for select to anon, authenticated
  using (exists (select 1 from public.games g
    where g.id = teams.game_id and g.status = 'active'
      and now() >= g.publish_at and now() < g.expires_at));

create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (exists (select 1 from public.games g
    where g.id = categories.game_id and g.status = 'active'
      and now() >= g.publish_at and now() < g.expires_at));

create policy clips_public_read on public.clips
  for select to anon, authenticated
  using (published and review_status = 'approved'
    and original_deleted_at is null and preview_deleted_at is null
    and exists (select 1 from public.games g
      where g.id = clips.game_id and g.status = 'active'
        and now() >= g.publish_at and now() < g.expires_at));

-- ── admin policies (for a future authenticated admin client; MVP admin writes
--    use the service-role key, which bypasses RLS) ────────────────────────────
create policy settings_admin      on public.settings      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy games_admin         on public.games         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy teams_admin         on public.teams         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_admin    on public.categories    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy clips_admin         on public.clips         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy orders_admin        on public.orders        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy order_items_admin   on public.order_items   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy edit_requests_admin on public.edit_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cleanup_log_admin   on public.cleanup_log   for select to authenticated using (public.is_admin());
create policy admin_users_self    on public.admin_users   for select to authenticated using (user_id = auth.uid());

-- ── safe public view: effective price + fixed column contract ───────────────
-- Runs with the definer's rights (security_invoker = false): exposes only
-- non-sensitive columns and hard-codes the visibility filter, so it never
-- depends on a caller policy. original_path is neither selected nor granted.
-- (Supabase's linter will flag this as a "Security Definer View" — intentional.)
create view public.public_clips with (security_invoker = false) as
  select c.id, c.game_id, c.team_id, c.category_id,
         c.jersey_number, c.description, c.duration_seconds,
         c.preview_path, c.poster_path,
         coalesce(c.price_cents, s.clip_default_price_cents) as price_cents,
         s.currency
  from public.clips c
  cross join public.settings s
  join public.games g on g.id = c.game_id
  where c.published and c.review_status = 'approved'
    and c.original_deleted_at is null and c.preview_deleted_at is null
    and g.status = 'active' and now() >= g.publish_at and now() < g.expires_at;

grant select on public.public_clips to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 0003_storage.sql
-- ----------------------------------------------------------------------------

-- Layer 1 · 0003_storage.sql — storage buckets (all private except site chrome)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('originals',     'originals',     false, 524288000, array['video/mp4','video/quicktime']),
  ('previews',      'previews',      false,  52428800, array['video/mp4']),
  ('posters',       'posters',       false,   5242880, array['image/jpeg','image/png','image/webp']),
  ('public-assets', 'public-assets', true,    5242880, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- No storage.objects policies needed for the MVP:
--   * originals / previews / posters are private with NO anon policy -> no public access
--   * the browser only ever receives short-lived signed URLs minted server-side
--   * admin uploads use signed upload URLs minted by the service role
--   * public-assets is public = true (logo / OG image only)

-- ----------------------------------------------------------------------------
-- 0004_seed.sql
-- ----------------------------------------------------------------------------

-- Layer 1 · 0004_seed.sql — seed the single settings row (edit later in /admin/settings)

insert into public.settings (id) values (1) on conflict (id) do nothing;

select * from public.settings;   -- expect one row with the defaults
