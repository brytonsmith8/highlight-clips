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
