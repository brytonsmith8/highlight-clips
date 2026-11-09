# BRYT VISION launch checklist

## Before launch
1. Review PR #5 on its Vercel preview (customer pages, cart, admin).
2. Run `0006_sport_school_jersey.sql`, then `0007_athlete_profiles_edit_orders.sql` in Supabase (SQL Editor). Additive only.
3. Admin > Launch: mark the temporary clips as TEST. Upload real clips with athlete profiles.
4. Make one real purchase yourself (clip, then a 7-clip BRYT VISION EDIT). Check: email, download, admin order, shipping address, upload a finished edit, customer download button.
5. Resend: verify your sending domain, otherwise customers cannot receive emails.
6. Plans: Vercel Pro (Hobby is non-commercial), Supabase Pro likely needed for video size (Free = 50 MB per file, 1 GB total).
7. Only then ask for the merge/deploy.

## Safe cleanup of test clips (separate, optional, later, your approval)
1. Admin > Launch: confirm only TEST clips are marked.
2. Use "Unpublish TEST clips" (type the confirmation phrase). This only hides them. Reversible by re-publishing.
3. Deleting test clips and their files is manual, per clip, from Admin > Clips, and is never done automatically.
4. Unpublished clips that were SOLD have their original files removed by the existing daily cleanup after all download windows close (plus 24 h grace).
