-- 0007 · athlete profiles (school + sport), optional game title, and BRYT VISION EDIT orders.
-- ADDITIVE ONLY. Nothing is dropped, renamed, rewritten or deleted. Safe to run more than once.
-- Run AFTER 0006_sport_school_jersey.sql.

-- 1) Athlete profiles: reuse the existing `athletes` table (id, name, jersey_number, created_at).
--    A profile = one athlete at one school. The athlete's identity is the profile id, never the jersey number.
alter table public.athletes add column if not exists school text;
alter table public.athletes add column if not exists sport  text;

-- 2) Optional free-text game title / details (home = school_a, away = school_b already exist).
alter table public.games add column if not exists title text;

-- Public search needs these display columns (the site already shows athlete names/numbers publicly).
grant select (school, sport) on public.athletes to anon, authenticated;
grant select (title)         on public.games    to anon, authenticated;

-- 3) BRYT VISION EDIT + FREE SHIRT orders. One row per paid Stripe Checkout Session.
--    PRIVATE: row level security is on and there are NO policies, and anon/authenticated have no grants.
--    Only the server (service role) can read or write it, so customer addresses can never be queried publicly.
create table if not exists public.edit_orders (
  id                  uuid        primary key default gen_random_uuid(),
  stripe_session_id   text        not null unique,          -- idempotency: one row per paid session
  status              text        not null default 'paid_editing_needed'
                      check (status in ('awaiting_payment','paid_editing_needed','editing_in_progress',
                                        'edit_completed','shirt_ready_to_ship','fulfilled')),
  payment_status      text        not null default 'paid',
  edit_price_cents    integer     not null default 5500,
  session_total_cents integer,
  customer_name       text,
  customer_email      text,
  customer_phone      text,
  ship_name           text,
  ship_line1          text,
  ship_line2          text,
  ship_city           text,
  ship_state          text,
  ship_postal_code    text,
  ship_country        text,
  athlete_id          uuid,
  athlete_name        text,
  athlete_jersey      text,
  athlete_school      text,
  shirt_size          text,
  shirt_color         text,
  shirt_sleeve        text,
  clips               jsonb       not null default '[]'::jsonb,  -- snapshot: clip ids, games, dates, jersey, school
  admin_notes         text,
  delivery_path       text,                                      -- private storage path of the finished edit video
  delivered_at        timestamptz,
  first_downloaded_at timestamptz,                           -- set when the customer first downloads the finished edit
  download_count      integer     not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists edit_orders_status_idx  on public.edit_orders (status, created_at desc);
create index if not exists edit_orders_athlete_idx on public.edit_orders (athlete_id);

alter table public.edit_orders enable row level security;
revoke all on public.edit_orders from anon, authenticated;
