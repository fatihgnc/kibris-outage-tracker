-- PostgREST answers every request from a cached copy of the schema, and it did
-- not pick up the column added in 20260824080000: for several minutes after the
-- push, `cancelled_reason` existed in the database but every query for it came
-- back "Could not find the column in the schema cache". This is the documented
-- way to make it re-read.
--
-- Keep this line at the end of any migration that changes a table's shape. It
-- costs nothing when the cache is already current, and without it a deploy can
-- go out against a schema the API cannot yet see.
notify pgrst, 'reload schema';
