-- Layer 1 · 0000_reset_prototype.sql
--
-- ONE-TIME cleanup for the Supabase project rtnucytxpbwvkzsauwbr.
--
-- Before the approved schema was applied, an earlier athlete-centric prototype
-- (games without a slug, plus athletes / clips / purchases) was created here.
-- Those tables conflict with 0001_schema.sql. This script drops them so the
-- approved migrations apply cleanly.
--
-- SAFETY: this DROPS four tables in `public`, but only after checking that each
-- non-empty table has been fully copied into schema `prototype_backup` (run
-- _prototype_backup.sql first). If a table is absent or already empty it is
-- skipped. On a fresh project every statement is a no-op.

do $$
declare
  t   text;
  src bigint;
  bak bigint;
begin
  foreach t in array array['games', 'clips', 'athletes', 'purchases']
  loop
    if to_regclass('public.' || t) is null then
      continue;                                   -- already gone
    end if;

    execute format('select count(*) from public.%I', t) into src;
    if src = 0 then
      continue;                                   -- nothing to preserve
    end if;

    if to_regclass('prototype_backup.' || t) is null then
      raise exception
        'public.% has % row(s) and no backup. Run _prototype_backup.sql first.',
        t, src;
    end if;

    execute format('select count(*) from prototype_backup.%I', t) into bak;
    if bak < src then
      raise exception
        'Backup prototype_backup.% has % row(s) but public.% has %. Aborting.',
        t, bak, t, src;
    end if;
  end loop;
end
$$;

drop table if exists public.purchases cascade;
drop table if exists public.clips     cascade;
drop table if exists public.athletes  cascade;
drop table if exists public.games     cascade;
