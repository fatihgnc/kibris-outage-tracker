// Fills in `scope` on records stored before the parser could read it (§10.4).
//
// Every district name is also a settlement name — Lefkoşa, Girne, Gazimağusa,
// Güzelyurt, İskele and Lefke are each a town and the district around it — so a
// stored record with areas = {'Lefke'} could be either reading, and until
// `scope` existed nothing in the row said which. The column defaults to the
// narrow one, which is what the site has always shown; this corrects the rows
// where the announcement said otherwise.
//
// It cannot be done in SQL. Which reading an old row was is a fact about an
// announcement, so the announcement is what has to be read: each candidate's
// sources are refetched and run through today's parser, exactly as
// `audit-records.ts` does, and the scope it derives is what gets written.
//
// Four verdicts, and every candidate is printed under one of them — including
// the ones that do not change. A model at temperature 0 is not a guarantee, and
// "nothing to write" and "read it wrong" look identical when only the writes
// are shown.
//
//   =  the derived scope matches what is stored
//   →  derived wider than stored: the write set
//   ~  a source has been republished since we read it, so today's text is no
//      evidence about this record. Printed with its URLs, never written.
//   ?  either no source could be re-derived — a dead link, a block, or text
//      today's parser rejects — or they read and none of them describes this
//      record. Said apart, because they call for different things. Printed,
//      never written.
//
//   npm run backfill:scope              # preview
//   npm run backfill:scope -- --confirm # writes
//   npm run backfill:scope -- --all     # every record, not just the ambiguous
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the
// environment first and .env.local otherwise, so pointing it at production is a
// matter of setting those two for one command.

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import type { DistrictId, OutageKind, OutageScope, SourceRef } from '../lib/types';
import { DISTRICTS } from '../lib/districts';
import { foldKey } from '../ingest/parse/text';
import { isSameEvent } from '../ingest/dedupe';
import { createRederiver } from './rederive';

type Row = {
  id: string;
  kind: OutageKind;
  starts_at: string;
  ends_at: string | null;
  district: DistrictId;
  areas: string[];
  sources: SourceRef[];
  ingested_at: string;
  scope: OutageScope;
};

/**
 * The rows worth spending a model read on: the ones whose `areas` hold their own
 * district's name, which is the only shape the ambiguity can take.
 *
 * Every other record names places that are not a district, so its scope is not
 * in question — and re-reading all of them costs a live call each and can only
 * introduce churn. `--all` opens it up for the day that assumption is wrong.
 */
function ambiguous(row: Row): boolean {
  const named = new Set(row.areas.map(foldKey));
  return named.has(foldKey(DISTRICTS[row.district].name));
}

function brief(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  if (flat.startsWith('<')) return 'expected a Supabase API response, got an HTML page — is the URL right?';
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const confirm = process.argv.includes('--confirm');
  const all = process.argv.includes('--all');
  // Said before anything else happens: this script writes, and which database
  // it is pointed at is the one thing worth being sure of first.
  console.log(`target: ${url}`);
  console.log(`${confirm ? 'writing' : 'previewing'}${all ? ', every record' : ''}\n`);

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client
    .from('outages')
    .select('id, kind, starts_at, ends_at, district, areas, sources, ingested_at, scope')
    // A record retired as bad data never described a real announcement, so
    // there is nothing about it to re-read.
    .or('cancelled_reason.is.null,cancelled_reason.neq.bad_data')
    .order('starts_at');
  if (error) throw new Error(`outages: ${brief(error.message)}`);

  const rows = (data ?? []) as Row[];
  const candidates = all ? rows : rows.filter(ambiguous);
  console.log(`${candidates.length} candidate(s) of ${rows.length} record(s)\n`);

  const rederive = createRederiver();
  const writes: { id: string; scope: OutageScope }[] = [];
  let unchanged = 0;
  let edited = 0;
  let unreadable = 0;

  for (const row of candidates) {
    const label = `${row.starts_at.slice(0, 10)} ${row.district} ${row.areas.join(', ')}`;
    // The row in the shape the ingest's own same-event rule reads.
    const stored = {
      kind: row.kind,
      district: row.district,
      areas: row.areas,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
    let derivedScope: OutageScope | null = null;
    let editedSince = false;
    let readable = false;

    for (const source of row.sources) {
      const rederived = await rederive(source);
      if (!rederived) continue;
      readable = true;
      if (Date.parse(rederived.publishedAt) > Date.parse(row.ingested_at)) editedSince = true;
      // Matched with `isSameEvent`, the rule the ingest already folds records
      // together by, rather than a second one written here.
      //
      // It was a second one, and it demanded the same instant. These records are
      // open-ended faults whose start is the announcement's publication time
      // stood in for one, and where that time came from is not stable: the
      // stored Girne record started 12:29, from a sitemap's lastmod, while the
      // page itself says 12:23. Six minutes, and the record fell out of its own
      // backfill reported as unreadable.
      for (const record of rederived.records) {
        if (!isSameEvent(stored, record)) continue;
        // Widest wins across sources, for the same reason mergeOutages does it:
        // one outlet abbreviating a district-wide announcement to a few of its
        // villages must not narrow what another one wrote in full.
        if (record.scope === 'district') derivedScope = 'district';
        else derivedScope ??= record.scope;
      }
    }

    if (derivedScope === null) {
      unreadable++;
      // Two different failures, said apart. Conflating them cost an afternoon:
      // a record whose sources read perfectly well was reported as unreadable
      // because nothing in them matched it, and the article was never the
      // problem.
      console.log(
        readable
          ? `? ${label} — sources read, none of them describes this record`
          : `? ${label} — no source could be re-derived`,
      );
      for (const source of row.sources) console.log(`    ${source.url}`);
      continue;
    }
    if (editedSince) {
      edited++;
      console.log(`~ ${label} — source republished since ingest, decide by hand (${derivedScope})`);
      for (const source of row.sources) console.log(`    ${source.url}`);
      continue;
    }
    if (derivedScope === row.scope) {
      unchanged++;
      console.log(`= ${label} — ${row.scope}`);
      continue;
    }
    writes.push({ id: row.id, scope: derivedScope });
    console.log(`→ ${label} — ${row.scope} becomes ${derivedScope}`);
  }

  console.log(
    `\n${writes.length} to write, ${unchanged} unchanged, ${edited} edited since ingest, ` +
      `${unreadable} unreadable`,
  );

  if (writes.length === 0) return;
  if (!confirm) {
    console.log('\nnothing written. Re-run with --confirm to apply.');
    return;
  }

  // One update per id, and only for rows that actually change. A no-op write
  // still fires outages_set_updated_at, and the sitemap publishes that as
  // lastmod — telling every crawler a page changed when nothing did.
  for (const write of writes) {
    const { error: updateError } = await client
      .from('outages')
      .update({ scope: write.scope })
      .eq('id', write.id);
    if (updateError) throw new Error(`${write.id}: ${brief(updateError.message)}`);
  }
  console.log(`${writes.length} record(s) updated`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
