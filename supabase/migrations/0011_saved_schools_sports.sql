-- 0011 · saved schools and sports for the admin upload screens.
-- ADDITIVE ONLY. Nothing existing is dropped, renamed, rewritten or deleted. Safe to run more than once.
-- Independent of 0010 (fulfillment). Run once in the Supabase SQL Editor.
--
-- 1) public.schools : the list of schools offered in the Home / Away dropdowns.
-- 2) public.sports  : the list of sports offered in the Sport dropdown.
--    Both are PRIVATE (row level security on, no policies, no grants to anon/authenticated): only the server
--    (service role) can read or write them. Games keep storing the school/sport NAME as text exactly as today,
--    so the public site, Find Your Clips, checkout and all existing games and clips are completely unaffected.
-- (clips.price is already numeric, so it needs no change. Existing games, clips and orders are not touched.)

create table if not exists public.schools (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);
create unique index if not exists schools_name_ci_key on public.schools (lower(btrim(name)));
alter table public.schools enable row level security;
revoke all on public.schools from anon, authenticated;

create table if not exists public.sports (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);
create unique index if not exists sports_name_ci_key on public.sports (lower(btrim(name)));
alter table public.sports enable row level security;
revoke all on public.sports from anon, authenticated;

-- Seed: every school already used by a game, clip or athlete (one row per spelling-insensitive name).
insert into public.schools (name)
select distinct on (lower(btrim(n))) btrim(n)
from (
  select school_a as n from public.games
  union all select school_b from public.games
  union all select school from public.clips
  union all select school from public.athletes
) s
where n is not null and btrim(n) <> ''
order by lower(btrim(n)), btrim(n)
on conflict do nothing;

-- Seed: common sports, then any sport already typed on a game or athlete ("&" is treated as "and").
insert into public.sports (name) values
  ('Football'), ('Basketball'), ('Baseball'), ('Softball'), ('Volleyball'), ('Soccer'),
  ('Track and Field'), ('Cross Country'), ('Wrestling'), ('Tennis'), ('Golf'), ('Swimming'), ('Cheerleading')
on conflict do nothing;

insert into public.sports (name)
select distinct on (lower(replace(btrim(n), '&', 'and'))) replace(btrim(n), '&', 'and')
from (
  select sport as n from public.games
  union all select sport from public.athletes
) s
where n is not null and btrim(n) <> ''
order by lower(replace(btrim(n), '&', 'and')), replace(btrim(n), '&', 'and')
on conflict do nothing;
