-- 0009 · admin login rate limiting. ADDITIVE ONLY (one new private table).
-- Stores only a keyed hash of the visitor address (never the raw address or any password).
create table if not exists public.admin_login_attempts (
  client_hash        text        primary key,
  failures           integer     not null default 0,
  window_started_at  timestamptz not null default now(),
  locked_until       timestamptz
);
alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from anon, authenticated;
