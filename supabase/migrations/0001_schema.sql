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
