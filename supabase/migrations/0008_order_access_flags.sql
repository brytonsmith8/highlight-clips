-- 0008 · private per-order access flags (refunds / disputes) and duplicate-purchase protection.
-- ADDITIVE ONLY. No existing row is changed, moved or deleted. Run AFTER 0006 and 0007.

-- 1) One row per Stripe Checkout Session ONLY when something happened to it (refund / dispute).
--    No row = normal, full access. Keyed by the same value as purchases.stripe_payment_id (the Checkout Session id).
--    PRIVATE: row level security on, no policies, no grants for anon/authenticated (server / service role only).
create table if not exists public.order_access_flags (
  stripe_session_id  text        primary key,
  refund_status      text        not null default 'none' check (refund_status in ('none','partial','full')),
  refunded_cents     integer     not null default 0,
  dispute_status     text        not null default 'none' check (dispute_status in ('none','open','won','lost')),
  needs_review       boolean     not null default false,
  stripe_charge_id   text,
  stripe_dispute_id  text,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.order_access_flags enable row level security;
revoke all on public.order_access_flags from anon, authenticated;

-- 2) A clip can be recorded at most once per order. Adds an index only; existing rows are not modified.
--    If a duplicate (order, clip) pair already existed this statement would fail and change nothing
--    (a read-only check found 0 duplicate groups).
create unique index if not exists purchases_session_clip_unique
  on public.purchases (stripe_payment_id, clip_id);
