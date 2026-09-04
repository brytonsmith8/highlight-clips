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
