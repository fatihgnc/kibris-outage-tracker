-- Settlement pages ask "which outages named this village", and `areas` cannot
-- answer it: it holds the spelling the announcement used — 'YENIBOGAZICI',
-- 'Yeniboğaziçi', 'Gonyeli' — so `areas @> '{Gönyeli}'` silently misses most of
-- them. Everywhere else in the codebase that comparison goes through `foldKey`.
--
-- This column is that fold, stored. It is written by the application
-- (`toOutageRow`), not computed here: foldKey is Turkish-specific — dotless i,
-- the ç/ş/ğ fold, locale-aware lowercasing — and a plpgsql imitation would
-- drift from the one the ingest matches places with, which is the one bug this
-- column exists to prevent.
--
-- Existing rows are filled by `npm run backfill:area-keys`, which must be run
-- once after this migration; until then they answer no settlement page.
alter table outages add column area_keys text[] not null default '{}';

create index outages_area_keys_idx on outages using gin (area_keys);

-- The notify that 20260824090000 and 20260827140000 both had to be written to
-- add after the fact. This migration changes a table's shape, so it ends here.
notify pgrst, 'reload schema';
