-- Saves the one Scripture shown to a customer with their purchase, so the confirmation page and
-- the confirmation email always show the same verse (even after a page refresh).
-- Additive and safe: nullable column, nothing existing changes. Until it is added, the site
-- still works and falls back to a stable per-order verse.
alter table public.purchases add column if not exists scripture text;
