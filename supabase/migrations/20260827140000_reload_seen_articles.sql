-- 20260827120000 created seen_articles without ending in the notify, so
-- PostgREST went on answering "Could not find the table in the schema cache"
-- for every read of it. The table is there — `supabase migration list` shows
-- the migration applied, and review_queue, which carries exactly the same
-- privileges and RLS, reads fine — so nothing is wrong with it but the cache.
--
-- The same fix as 20260824090000, for the same reason, which is twice now: the
-- notify belongs at the end of any migration that changes a table's shape.
notify pgrst, 'reload schema';
