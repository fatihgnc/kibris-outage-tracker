// Checks every stored outage against the announcement it came from (§10.4).
//
// A parser fix does not reach the archive: records keep whatever the parser
// said on the day they were ingested, and a date is part of the fingerprint, so
// a wrong one is a whole extra row rather than a field to correct. Three such
// bugs — a publication date that could not be read, a named weekday that fell
// back to the publication date, and "Vadili ağıllar" read as the village
// Ağıllar — put nineteen wrong records in the archive that nothing in the
// codebase would ever have flagged.
//
// So: refetch each record's sources, run them through today's parser, and
// report every stored record the sources no longer support. Read-only — it
// reports, it never writes. Run it after any change to the parser, and against
// production before trusting what the archive says.
//
// Two verdicts, because they call for different things. X is a record no
// source supports and nothing about the sources has changed since it was
// ingested: the parser was wrong, and its ids are printed for retire-records.
// ~ is a record whose source has been republished since — outlets rewrite
// these announcements in place, moving a lead from 'yarın' to 'bugün' on the
// morning of the work — so today's text says nothing about a record parsed
// from the earlier one. Those ids are withheld deliberately: read the article
// and decide. Retiring one on this evidence once removed a correct record and
// left the wrong one standing.
//
//   node --import tsx scripts/audit-records.ts
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the
// environment first and .env.local otherwise, so pointing it at production is
// a matter of setting those two for one command.

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import type { SourceRef } from '../lib/types';
import { foldKey } from '../ingest/parse/text';
// Shared with backfill-scope.ts: one answer to "what does today's parser make
// of this article", not two of them that can drift apart.
import { createRederiver, type Rederived } from './rederive';

const deriveFrom = createRederiver();
// What each source said, kept only so a failing row can print it back. The
// reriver memoises its own fetches.
const derived = new Map<string, Rederived | null>();

function describe(rederived: Rederived | null): string {
  if (!rederived) return '(could not re-derive)';
  return rederived.records
    .map(
      (record) =>
        `${record.district}@${record.startsAt.slice(0, 10)}[${record.areas.map(foldKey).join('|')}]`,
    )
    .join(' ; ');
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  console.log(`auditing ${url}`);

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client
    .from('outages')
    .select('id, starts_at, district, areas, sources, ingested_at, cancelled_reason')
    // Records already retired as bad data are expected to fail this check —
    // failing it is why they were retired.
    .or('cancelled_reason.is.null,cancelled_reason.neq.bad_data')
    .order('starts_at');
  if (error) throw new Error(`outages: ${error.message}`);

  const rows = data ?? [];
  console.log(`${rows.length} record(s)\n`);
  const unsupported: string[] = [];
  const edited: string[] = [];
  let unreadable = 0;

  for (const row of rows) {
    const stored = new Set((row.areas as string[]).map(foldKey));
    let readable = false;
    let supported = false;
    let editedSince = false;

    for (const source of row.sources as SourceRef[]) {
      const rederived = await deriveFrom(source);
      derived.set(source.url, rederived);
      if (!rederived) continue;
      readable = true;
      // The page says it was published after we read it, so what stands there
      // now is not what this record was parsed from. Outlets rewrite these
      // announcements in place and republish under a new slug that the old
      // URL redirects to.
      if (Date.parse(rederived.publishedAt) > Date.parse(row.ingested_at)) editedSince = true;
      // Supported means some source still puts this district at this instant
      // with at least one of these places. Outlets abbreviate place lists, so
      // an overlap is the honest bar; demanding the full set would flag rows
      // that are merely less complete than the article.
      for (const record of rederived.records) {
        if (record.district !== row.district) continue;
        if (Date.parse(record.startsAt) !== Date.parse(row.starts_at)) continue;
        const areas = new Set(record.areas.map(foldKey));
        if ([...stored].some((area) => areas.has(area))) supported = true;
      }
    }

    if (!readable) {
      unreadable++;
      console.log(`? ${row.starts_at.slice(0, 10)} ${row.district} — no source could be re-derived`);
      continue;
    }
    if (supported) continue;

    // Reported, never retired. An edit means today's text is no evidence about
    // a record parsed from the earlier one, and retiring on that evidence once
    // removed a correct record while leaving the wrong one standing. Which of
    // the two the archive should keep is a judgement about what the utility
    // actually announced, so it goes to a person.
    const bucket = editedSince ? edited : unsupported;
    bucket.push(row.id);
    const mark = editedSince ? '~' : 'X';
    const note = editedSince ? ' — source edited since ingest, decide by hand' : '';
    console.log(`${mark} ${row.starts_at.slice(0, 10)} ${row.district} ${(row.areas as string[]).join(', ')}${note}`);
    for (const source of row.sources as SourceRef[]) {
      console.log(`    ${source.url}`);
      console.log(`      today: ${describe(derived.get(source.url) ?? null)}`);
    }
  }

  console.log(`\n${unsupported.length} unsupported, ${edited.length} edited since ingest, ` +
      `${unreadable} unreadable, ${rows.length} checked`);
  // Only the unsupported ids are printed in the form retire-records.ts takes.
  // The edited ones deliberately are not: pasting them onward is the mistake
  // this split exists to prevent.
  if (unsupported.length > 0) console.log(JSON.stringify(unsupported));
  // A wrong archive is the failure this exists to catch, so say so in the exit
  // code: this belongs in CI as much as in a terminal.
  process.exit(unsupported.length > 0 || edited.length > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
