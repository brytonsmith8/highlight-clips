# Highlight Clips — Bryt Vision Media

A temporary sports highlight clip marketplace. Bryt Vision Media films local
games, cuts short highlight clips, and sells them individually to athletes,
parents, and fans.

- Customers browse by **Game → Team → Category → Clip**, watch a low-quality
  watermarked preview, and buy the clips they want.
- Guest checkout only (no customer accounts). After payment the customer gets a
  private `/order/<token>` link by email to download the high-quality files.
- Two independent clocks: **game expiration** (how long a game stays public) and
  **purchase download window** (how long after buying a customer can download).
- Originals live in **private** storage and are only reachable through
  short-lived signed URLs issued after server-side authorization.
- Not an archive: original files are deleted once no active download window
  needs them; order records are kept permanently.

## Stack

| Concern | Tool |
| --- | --- |
| App framework | Next.js 16 (App Router) |
| Hosting / CI | Vercel (auto-deploy on push to `main`) |
| Database, storage, auth | Supabase |
| Payments | Stripe (added in a later layer) |
| Transactional email | Resend (added in a later layer) |
| Styling | Tailwind CSS v4 |

## Local development

```bash
cp .env.example .env.local   # then fill in the Supabase values
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

See `.env.example`. Local values go in `.env.local` (gitignored); deployed
values are set in the Vercel project settings for both Production and Preview.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses RLS. Never sent to the browser. |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin, no trailing slash |

## Database migrations

SQL migrations live in `supabase/migrations/` and are applied by pasting them
into the **Supabase Dashboard → SQL Editor** in filename order. (Added in
Layer 1.)

## Project layout

```
app/                 routes (App Router)
components/           shared UI
lib/
  env.ts             validated environment-variable access
  supabase/
    client.ts        browser client (anon key)
    server.ts        server client for RSC / actions / route handlers (anon key)
    service.ts       service-role client (server only, bypasses RLS)
supabase/migrations/ SQL migrations (Layer 1+)
```

## Build status

This project is being built in reviewed layers. **Layer 0 (foundation)** is
complete: repo consolidation, Supabase client wiring, environment handling, and
a mobile-first homepage shell. No database schema or product features yet.
