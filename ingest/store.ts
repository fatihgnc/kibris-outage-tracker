import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outage } from '../lib/types';
import { mapOutageRow, toOutageRow, type OutageRow } from '../lib/db';
import { isSameEvent, mergeOutages } from './dedupe';

export type StoreResult = {
  created: number;
  updated: number;
  cancelled: number;
};

const OUTAGE_COLUMNS =
  'id, utility, kind, starts_at, ends_at, district, areas, sources, published_at, ingested_at, confidence, cancelled_at, cancelled_reason';

// The stored form carries the retraction flag, which the public Outage type
// deliberately does not expose to the frontend.
type StoredOutage = Outage & { cancelled: boolean };

// Loads the stored records a batch could plausibly duplicate: same districts,
// within a day of the batch's time span.
async function loadCandidates(client: SupabaseClient, records: Outage[]): Promise<StoredOutage[]> {
  if (records.length === 0) return [];
  const districts = [...new Set(records.map((record) => record.district))];
  const times = records.map((record) => Date.parse(record.startsAt));
  const from = new Date(Math.min(...times) - 86400000).toISOString();
  const to = new Date(Math.max(...times) + 86400000).toISOString();

  const { data, error } = await client
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .in('district', districts)
    .gte('starts_at', from)
    .lte('starts_at', to);
  if (error) throw new Error(`loadCandidates: ${error.message}`);
  return (data as OutageRow[]).map((row) => ({
    ...mapOutageRow(row),
    cancelled: row.cancelled_at !== null,
  }));
}

// Writes are upserts keyed by id, so re-running the ingest is idempotent
// (§8.1). Merging sources and preserving the earliest publishedAt happens
// here, before the upsert — never in SQL.
export async function storeOutages(client: SupabaseClient, records: Outage[]): Promise<StoreResult> {
  if (records.length === 0) return { created: 0, updated: 0, cancelled: 0 };

  // Cancelled rows stay out of matching: a retracted outage that is announced
  // again is a new event, not a row to quietly revive.
  const stored = (await loadCandidates(client, records)).filter((record) => !record.cancelled);
  const storedIds = new Set(stored.map((record) => record.id));
  const toWrite = new Map<string, Outage>();

  for (const incoming of records) {
    const existing =
      stored.find((candidate) => candidate.id === incoming.id) ??
      [...toWrite.values()].find((candidate) => isSameEvent(candidate, incoming)) ??
      stored.find((candidate) => isSameEvent(candidate, incoming));

    if (!existing) {
      toWrite.set(incoming.id, incoming);
      continue;
    }

    // mergeOutages keeps the existing id, so this updates the row in place
    // rather than creating a second one for the same event.
    toWrite.set(existing.id, mergeOutages(existing, incoming));
  }

  const rows = [...toWrite.values()].map((record) => toOutageRow(record));
  const { error } = await client.from('outages').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`storeOutages: ${error.message}`);

  let created = 0;
  let updated = 0;
  for (const id of toWrite.keys()) {
    if (storedIds.has(id)) updated++;
    else created++;
  }
  return { created, updated, cancelled: 0 };
}

// A cancellation announcement retracts the matching record rather than adding
// a new one (§10.6). Retracted records leave active and upcoming views but
// remain in the archive marked as cancelled.
export async function retractOutages(client: SupabaseClient, records: Outage[]): Promise<number> {
  if (records.length === 0) return 0;
  const stored = await loadCandidates(client, records);
  const ids = new Set<string>();
  for (const record of records) {
    for (const candidate of stored) {
      if (candidate.id === record.id || isSameEvent(candidate, record)) ids.add(candidate.id);
    }
  }
  if (ids.size === 0) return 0;

  const { error } = await client
    .from('outages')
    .update({ cancelled_at: new Date().toISOString(), cancelled_reason: 'retracted' })
    .in('id', [...ids])
    .is('cancelled_at', null);
  if (error) throw new Error(`retractOutages: ${error.message}`);
  return ids.size;
}

export type ReviewItem = {
  source: { name: string; url: string };
  rawText: string;
  reason: string;
};

// Anything both parser stages fail on is written here with the raw text and
// the reason, and is never silently dropped (§10.4).
//
// An announcement the parser cannot read is still on the listing at the next
// poll, so this has to be idempotent the way storeOutages is: the queue is one
// person's work list, and a cron would otherwise fill it with copies of the
// same item. The database keys each row on the source URL plus the raw text
// and drops repeats; the count returned is what was actually added.
//
// Written as one insert per item that tolerates the duplicate, rather than an
// upsert with `onConflict: 'fingerprint'`. The conflict target is a generated
// column, so it never appears in the payload, and an upsert only suppresses
// the repeat while PostgREST can resolve that target from its schema cache. It
// could not for two days: every run reached this line, took a unique violation
// on a repeat it was supposed to ignore, and died before logRun, so the site
// went on telling readers its data was two days stale while the ingest was in
// fact storing outages the whole time. Handling the violation here needs no
// conflict target and cannot regress that way — the guarantee stays in the
// schema, where the unique index enforces it against every writer.
export async function queueForReview(client: SupabaseClient, items: ReviewItem[]): Promise<number> {
  let queued = 0;
  for (const item of items) {
    const { error } = await client.from('review_queue').insert({
      source: item.source,
      raw_text: item.rawText.slice(0, 8000),
      reason: item.reason,
    });
    if (!error) {
      queued++;
      continue;
    }
    // 23505 is the unique violation on review_queue_fingerprint_idx: this
    // announcement is already on the list, which is the ordinary case and not
    // a reason to end the run.
    if (error.code === '23505') continue;
    throw new Error(`queueForReview: ${error.message}`);
  }
  return queued;
}
