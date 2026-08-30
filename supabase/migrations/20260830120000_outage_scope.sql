-- What `areas` names: the places that lose power, or a district.
--
-- Every district name is also a settlement name. Lefkoşa, Girne, Gazimağusa,
-- Güzelyurt, İskele and Lefke are each a town and the district around it, so a
-- stored record with areas = {'Lefke'} is two different announcements — the
-- town, one lamp on the map, or the district, nineteen — and nothing in the row
-- said which. resolveDarkness took the narrow reading in silence, so the island
-- showed one dark point under a headline reading "Lefke'de arıza". 11 of 193
-- stored records are ambiguous this way.
--
-- The column holds the reading, taken from the announcement by the parser:
--
--   'places'   -- `areas` names the settlements that lose power. What every
--                 record has meant until now.
--   'district' -- the announcement says the district is out and names no place
--                 inside it; `areas` holds the district's own name and the map
--                 darkens every settlement in `district`.
--
-- Deliberately not reflected in `area_keys`. That column is the record of what
-- the announcement named, and it is what a settlement page is found by; widening
-- it would file this record under nineteen villages the announcement never
-- wrote. The map is a reading of the record. `area_keys` is the record.

create type outage_scope as enum ('places', 'district');

alter table outages add column scope outage_scope not null default 'places';

-- No backfill `update` here, unlike 20260824080000. That migration could state
-- what the old rows meant from the schema alone; this one cannot — which of the
-- two readings an old row was is a fact about an announcement, not about the
-- database. The default asserts the narrow reading, which is what the site has
-- been showing all along, and `npm run backfill:scope` corrects the eleven by
-- refetching their sources and re-reading them through today's parser.
--
-- No check constraint tying scope to the shape of `areas` either. A merged
-- district-scope record legitimately carries both the district's name and a
-- village an outlet listed (ingest/dedupe.ts), so a constraint strict enough to
-- be useful would reject correct rows. And no index: nothing queries by scope.

notify pgrst, 'reload schema';
