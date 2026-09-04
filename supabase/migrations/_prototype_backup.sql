-- Layer 1 · _prototype_backup.sql
--
-- Non-destructive. Copies the earlier prototype tables into a separate
-- `prototype_backup` schema so their data survives the Layer 1 reset.
-- Nothing in `public` is changed or removed by this script.
--
-- Safe to run once. Re-running errors with "already exists" (harmless) — drop
-- prototype_backup first if you truly need to refresh it.

create schema if not exists prototype_backup;

create table prototype_backup.games     as table public.games;
create table prototype_backup.clips     as table public.clips;
create table prototype_backup.athletes  as table public.athletes;
create table prototype_backup.purchases as table public.purchases;

-- Verify every row was copied (bak must equal src for all four).
select
  (select count(*) from public.games)              as src_games,
  (select count(*) from prototype_backup.games)     as bak_games,
  (select count(*) from public.clips)               as src_clips,
  (select count(*) from prototype_backup.clips)     as bak_clips,
  (select count(*) from public.athletes)            as src_athletes,
  (select count(*) from prototype_backup.athletes)  as bak_athletes,
  (select count(*) from public.purchases)           as src_purchases,
  (select count(*) from prototype_backup.purchases) as bak_purchases;
