// Fills `area_keys` on rows that predate the column (migration 20260829090100).
//
// Settlement pages find records by the normalised place key, not by the
// spelling the announcement used. The ingest writes that key on every write
// from now on, but the rows already in the table were written before the
// column existed and carry the empty default — so until this has run, every
// settlement page reports that nothing has ever happened there.
//
// Run once, immediately after the migration:
//
//   npm run backfill:area-keys
//
// Idempotent: it recomputes the key from `areas`, which is the same input the
// ingest uses, so running it twice writes the same values. Safe to re-run after
// any change to foldKey — and it must be re-run then, or old rows keep the
// old fold while new ones get the new one.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the
// environment first and .env.local otherwise, so pointing it at production is
// a matter of setting those two for one command.

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import { areaKeys } from '../lib/db';
import { PLACE_PAGE_MIN_RECORDS } from '../lib/places';

// Everything runs inside main(): tsx compiles this to CJS, where a top-level
// await is a syntax error. The other scripts in here are shaped the same way.
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  // Say which database is about to be written to, before writing to it.
  // `.env.local` points at the local stack, and this script is meant to also be
  // pointed at production by setting the two variables for one command — so the
  // one mistake it must not make quietly is running against the wrong one.
  console.log(`target: ${new URL(url).host}`);

  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await client.from('outages').select('id, areas, area_keys, cancelled_reason');
  if (error) throw new Error(`read: ${brief(error.message)}`);

  const rows = data as {
    id: string;
    areas: string[];
    area_keys: string[] | null;
    cancelled_reason: string | null;
  }[];

  // Only the rows that would actually change are written. A no-op update would
  // still fire outages_set_updated_at and move every record's `updated_at`,
  // which is what the sitemap publishes as lastmod — telling search engines the
  // entire archive changed today when nothing did.
  const stale: { id: string; area_keys: string[] }[] = [];
  for (const row of rows) {
    const next = areaKeys(row.areas);
    if (next.join('|') !== (row.area_keys ?? []).join('|')) stale.push({ id: row.id, area_keys: next });
  }

  console.log(`${rows.length} records, ${stale.length} to update`);

  let written = 0;
  for (const row of stale) {
    const { error: updateError } = await client
      .from('outages')
      .update({ area_keys: row.area_keys })
      .eq('id', row.id);
    if (updateError) throw new Error(`update ${row.id}: ${brief(updateError.message)}`);
    written++;
  }

  console.log(`done — ${written} updated`);

  // Which settlements this actually puts online. Printed because the answer is
  // the point of the migration, and an empty list here is the difference
  // between "the backfill worked" and "the backfill worked and nothing
  // qualified" — which look identical from the sitemap.
  //
  // Counted over the same rows the site counts (fetchAreaKeyCounts), which means
  // without the ones retired as bad data. Counting all of them read plausibly
  // and was wrong: on the development archive it reported 48 settlements about
  // to get a page when the site would publish 33. A place whose history is
  // mostly records that never described a real announcement has no history.
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.cancelled_reason === 'bad_data') continue;
    for (const k of areaKeys(row.areas)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const qualifying = ranked.filter(([, count]) => count >= PLACE_PAGE_MIN_RECORDS);

  console.log(
    `${ranked.length} distinct places named, ${qualifying.length} at or above the ` +
      `${PLACE_PAGE_MIN_RECORDS}-record threshold for a settlement page:`,
  );
  for (const [place, count] of qualifying.slice(0, 25)) {
    console.log(`  ${String(count).padStart(4)}  ${place}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

/**
 * Keeps a failure readable.
 *
 * Point this at a URL that is not a PostgREST endpoint — the site's own domain
 * is the easy mistake, since both are "the project's address" — and supabase-js
 * hands back the entire HTML page it got as the error message. Four kilobytes
 * of a Next.js 404 scrolls the one line that matters, the `target:` printed
 * above, off the screen.
 */
function brief(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  if (flat.startsWith('<')) return `expected a Supabase API response, got an HTML page — is the URL right?`;
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat;
}
