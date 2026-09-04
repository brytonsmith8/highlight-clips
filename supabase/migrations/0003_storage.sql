-- Layer 1 · 0003_storage.sql — storage buckets (all private except site chrome)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('originals',     'originals',     false, 524288000, array['video/mp4','video/quicktime']),
  ('previews',      'previews',      false,  52428800, array['video/mp4']),
  ('posters',       'posters',       false,   5242880, array['image/jpeg','image/png','image/webp']),
  ('public-assets', 'public-assets', true,    5242880, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- No storage.objects policies needed for the MVP:
--   * originals / previews / posters are private with NO anon policy -> no public access
--   * the browser only ever receives short-lived signed URLs minted server-side
--   * admin uploads use signed upload URLs minted by the service role
--   * public-assets is public = true (logo / OG image only)
