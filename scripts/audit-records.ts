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
//   node --import tsx scripts/audit-records.ts
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the
// environment first and .env.local otherwise, so pointing it at production is
// a matter of setting those two for one command.

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import type { SourceRef } from '../lib/types';
import { politeFetch, type ConditionalCache } from '../ingest/http';
import { articleDate } from '../ingest/adapters/outlet';
import { extractArticle } from '../ingest/adapters/feed';
import { parseAnnouncement } from '../ingest/parse';
import { foldKey } from '../ingest/parse/text';

type Derived = { district: string; areas: Set<string>; startsAt: string };

const cache: ConditionalCache = new Map();
const derived = new Map<string, Derived[] | null>();

// null means the announcement could not be re-derived at all — a dead link, a
// block, or text today's parser rejects. That is not evidence against the
// record, so it is reported separately and never counted as a failure.
async function deriveFrom(source: SourceRef): Promise<Derived[] | null> {
  const hit = derived.get(source.url);
  if (hit !== undefined) return hit;

  let result: Derived[] | null = null;
  const article = await politeFetch(source.url, cache);
  if (article.status === 'ok') {
    const { title, body } = extractArticle(article.body);
    const publishedAt = articleDate(article.body);
    if (publishedAt) {
      const outcome = parseAnnouncement({ source, title, body, publishedAt, fetchedAt: publishedAt });
      if (outcome.status === 'parsed') {
        result = outcome.records.map((record) => ({
          district: record.district,
          areas: new Set(record.areas.map(foldKey)),
          startsAt: record.startsAt,
        }));
      }
    }
  }
  derived.set(source.url, result);
  return result;
}

function describe(records: Derived[] | null): string {
  if (!records) return '(could not re-derive)';
  return records
    .map((record) => `${record.district}@${record.startsAt.slice(0, 10)}[${[...record.areas].join('|')}]`)
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
    .select('id, starts_at, district, areas, sources, cancelled_reason')
    // Records already retired as bad data are expected to fail this check —
    // failing it is why they were retired.
    .or('cancelled_reason.is.null,cancelled_reason.neq.bad_data')
    .order('starts_at');
  if (error) throw new Error(`outages: ${error.message}`);

  const rows = data ?? [];
  console.log(`${rows.length} record(s)\n`);
  const unsupported: string[] = [];
  let unreadable = 0;

  for (const row of rows) {
    const stored = new Set((row.areas as string[]).map(foldKey));
    let readable = false;
    let supported = false;

    for (const source of row.sources as SourceRef[]) {
      const records = await deriveFrom(source);
      if (!records) continue;
      readable = true;
      // Supported means some source still puts this district at this instant
      // with at least one of these places. Outlets abbreviate place lists, so
      // an overlap is the honest bar; demanding the full set would flag rows
      // that are merely less complete than the article.
      for (const record of records) {
        if (record.district !== row.district) continue;
        if (Date.parse(record.startsAt) !== Date.parse(row.starts_at)) continue;
        if ([...stored].some((area) => record.areas.has(area))) supported = true;
      }
    }

    if (!readable) {
      unreadable++;
      console.log(`? ${row.starts_at.slice(0, 10)} ${row.district} — no source could be re-derived`);
      continue;
    }
    if (supported) continue;

    unsupported.push(row.id);
    console.log(`X ${row.starts_at.slice(0, 10)} ${row.district} ${(row.areas as string[]).join(', ')}`);
    for (const source of row.sources as SourceRef[]) {
      console.log(`    ${source.url}`);
      console.log(`      today: ${describe(derived.get(source.url) ?? null)}`);
    }
  }

  console.log(`\n${unsupported.length} unsupported, ${unreadable} unreadable, ${rows.length} checked`);
  if (unsupported.length > 0) console.log(JSON.stringify(unsupported));
  // A wrong archive is the failure this exists to catch, so say so in the exit
  // code: this belongs in CI as much as in a terminal.
  process.exit(unsupported.length > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
