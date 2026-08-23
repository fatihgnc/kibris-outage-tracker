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
  'id, utility, kind, starts_at, ends_at, district, areas, sources, published_at, ingested_at, confidence, cancelled_at';

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
    .update({ cancelled_at: new Date().toISOString() })
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
export async function queueForReview(client: SupabaseClient, items: ReviewItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const { error } = await client.from('review_queue').insert(
    items.map((item) => ({
      source: item.source,
      raw_text: item.rawText.slice(0, 8000),
      reason: item.reason,
    })),
  );
  if (error) throw new Error(`queueForReview: ${error.message}`);
  return items.length;
}
