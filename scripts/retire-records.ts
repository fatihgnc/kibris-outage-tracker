// Retires records that scripts/audit-records.ts found unsupported (§10.6).
//
// The archive never deletes: history stays intact, and the schema grants the
// service role no delete to make that stick. A record the ingest invented is
// retired instead — cancelled with the reason 'bad_data', which drops it from
// every view without losing the fact that it was once published.
//
// Deliberately not 'retracted'. That reason means the utility called the work
// off, which is real news the archive keeps and marks; using it for a parser
// mistake tells the reader an outage was announced and cancelled when neither
// happened.
//
// Takes the ids audit-records.ts prints, as arguments or as a JSON array on
// stdin, and prints what it would change. Nothing is written without --confirm.
//
//   npm run audit                       # prints the ids
//   npm run retire -- '["id", ...]'     # preview
//   npm run retire -- '["id", ...]' --confirm
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the
// environment first and .env.local otherwise.

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';

function readIds(): string[] {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const ids = new Set<string>();
  for (const arg of args) {
    const trimmed = arg.trim();
    if (trimmed.startsWith('[')) {
      for (const id of JSON.parse(trimmed) as string[]) ids.add(id);
    } else {
      ids.add(trimmed);
    }
  }
  return [...ids];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const ids = readIds();
  if (ids.length === 0) throw new Error('no ids given — pass them as arguments or as a JSON array');

  const confirm = process.argv.includes('--confirm');
  const client = createClient(url, key, { auth: { persistSession: false } });
  console.log(`${confirm ? 'retiring' : 'previewing'} ${ids.length} record(s) on ${url}\n`);

  // Whole ids or the leading characters of one. The readable half of an outage
  // URL carries only the first eight — `outageIdPrefix` — and that URL is what a
  // person actually has in hand when they decide a record should go, so
  // demanding the other twenty-four means a separate query first, by hand,
  // against production.
  //
  // Ambiguity refuses rather than picks, exactly as fetchOutageByIdPrefix does
  // for the page: two records behind one prefix is a prefix that names neither,
  // and retiring an arbitrary one of them is the mistake this script exists to
  // be careful about.
  const { data, error } = await client
    .from('outages')
    .select('id, starts_at, district, areas, cancelled_at, cancelled_reason')
    .or(ids.map((id) => `id.like.${id}*`).join(','))
    .order('starts_at');
  if (error) throw new Error(`outages: ${error.message}`);

  const all = data ?? [];
  const ambiguous = ids.filter((id) => all.filter((row) => row.id.startsWith(id)).length > 1);
  const rows = all.filter((row) => !ambiguous.some((id) => row.id.startsWith(id)));
  const missing = ids.filter(
    (id) => !ambiguous.includes(id) && !all.some((row) => row.id.startsWith(id)),
  );
  for (const id of ambiguous) {
    const hits = all.filter((row) => row.id.startsWith(id)).map((row) => row.id);
    console.log(`  ! ${id} — names ${hits.length} records, not one: ${hits.join(', ')}`);
  }
  for (const row of rows) {
    const was = row.cancelled_reason ?? 'active';
    console.log(`  ${row.starts_at.slice(0, 10)} ${row.district} ${(row.areas as string[]).join(', ')}`);
    console.log(`    ${was} -> bad_data`);
  }
  for (const id of missing) console.log(`  ! ${id} — no such record`);

  if (!confirm) {
    console.log('\nnothing written. Re-run with --confirm to apply.');
    return;
  }

  if (rows.length === 0) {
    console.log('\nnothing to retire.');
    return;
  }

  // A row that is already cancelled keeps its original timestamp: when it left
  // the site is a fact worth keeping, and only the reason was wrong. Active
  // rows need both, since the schema rejects one without the other.
  const now = new Date().toISOString();
  const active = rows.filter((row) => row.cancelled_at === null).map((row) => row.id);
  const cancelled = rows.filter((row) => row.cancelled_at !== null).map((row) => row.id);

  if (active.length > 0) {
    const result = await client
      .from('outages')
      .update({ cancelled_at: now, cancelled_reason: 'bad_data' })
      .in('id', active)
      .select('id');
    if (result.error) throw new Error(`retire: ${result.error.message}`);
    console.log(`\nretired ${result.data?.length ?? 0}`);
  }
  if (cancelled.length > 0) {
    const result = await client
      .from('outages')
      .update({ cancelled_reason: 'bad_data' })
      .in('id', cancelled)
      .select('id');
    if (result.error) throw new Error(`relabel: ${result.error.message}`);
    console.log(`relabelled ${result.data?.length ?? 0}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
