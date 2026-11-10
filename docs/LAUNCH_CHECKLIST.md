# BRYT VISION launch checklist

## Before launch
1. Review PR #5 on its Vercel preview (customer pages, cart, admin).
2. Run `0006_sport_school_jersey.sql`, then `0007_athlete_profiles_edit_orders.sql` in Supabase (SQL Editor). Additive only.
3. Upload real clips with athlete profiles; delete the temporary test clips yourself when you are done testing.
4. Make one real purchase yourself (clip, then a 7-clip BRYT VISION EDIT). Check: email, download, admin order, shipping address, upload a finished edit, customer download button.
5. Resend: verify your sending domain, otherwise customers cannot receive emails.
6. Plans: Vercel Pro (Hobby is non-commercial), Supabase Pro likely needed for video size (Free = 50 MB per file, 1 GB total).
7. Only then ask for the merge/deploy.

## Removing test clips (manual, by you, when you decide)
- Admin > Clips: Delete each test clip. Admin > Games: Delete test games.
- A clip or game that customers have paid for is protected and cannot be deleted from Admin; unpublish it instead (buyers keep their downloads).
- If a test order exists, remove it from Admin > Orders first (that is a deliberate, separate step), then delete its clips.
