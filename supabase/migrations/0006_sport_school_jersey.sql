-- 0006 · sport, per-clip school and jersey number (additive, optional columns only).
-- Nothing existing is changed or removed; every new column is nullable.
alter table public.games add column if not exists sport text;
alter table public.clips add column if not exists school text;
alter table public.clips add column if not exists jersey_number text;

-- clips uses column-level grants for the public (anon) role, so the new public columns need one too.
grant select (school, jersey_number) on public.clips to anon, authenticated;
grant select (sport) on public.games to anon, authenticated;
