-- Layer 1 · 0004_seed.sql — seed the single settings row (edit later in /admin/settings)

insert into public.settings (id) values (1) on conflict (id) do nothing;

select * from public.settings;   -- expect one row with the defaults
