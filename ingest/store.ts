import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { Outage } from '../lib/types';
import type { RawAnnouncement, Resolution } from './parse';
import { mapOutageRow, toOutageRow, type OutageRow } from '../lib/db';
import { isSameEvent, mergeOutages } from './dedupe';
import { foldKey } from './parse/text';
import { NO_END_ASSUMED_OVER_MS } from '../lib/time';

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

// How many times one unchanged article may be sent to the model before the
// ingest stops trying. A transient API failure deserves another go; an article
// the model cannot make sense of must not be re-sent every ten minutes forever.
const MAX_PARSE_ATTEMPTS = 3;

export type SeenState = { contentHash: string; attempts: number; parsedOk: boolean };

/**
 * Splits announcements into the ones worth reading and the ones already read.
 *
 * The adapters look three days back and the ingest runs every ten minutes, so
 * the same article arrives hundreds of times. That was free when parsing was a
 * pile of regexes; it is now a request to a model (§10.4).
 *
 * An article is worth reading when its text has not been read successfully and
 * has not already failed MAX_PARSE_ATTEMPTS times. The hash is over the text,
 * not the URL, because outlets rewrite these announcements in place and a
 * rewritten one is new information.
 */
export async function selectUnread(
  client: SupabaseClient,
  announcements: RawAnnouncement[],
): Promise<RawAnnouncement[]> {
  if (announcements.length === 0) return [];
  const urls = announcements.map((a) => a.source.url);
  const { data, error } = await client
    .from('seen_articles')
    .select('url, content_hash, attempts, parsed_ok')
    .in('url', urls);
  // A failure here must not stop a run: reading everything again costs money,
  // reading nothing costs the site its data.
  if (error) {
    console.warn(`selectUnread: ${error.message} — falling back to reading everything`);
    return announcements;
  }

  const seen = new Map<string, SeenState>(
    (data as { url: string; content_hash: string; attempts: number; parsed_ok: boolean }[]).map(
      (row) => [row.url, { contentHash: row.content_hash, attempts: row.attempts, parsedOk: row.parsed_ok }],
    ),
  );

  return announcements.filter((announcement) => {
    const state = seen.get(announcement.source.url);
    if (!state) return true;
    if (state.contentHash !== articleHash(announcement)) return true; // rewritten
    return !state.parsedOk && state.attempts < MAX_PARSE_ATTEMPTS;
  });
}

/**
 * Records what happened to each article that was read. `parsedOk` covers both
 * useful outcomes — records extracted, and a confident "this is not an outage"
 * — because both mean the text has been understood and need not be paid for
 * again.
 */
export async function markRead(
  client: SupabaseClient,
  results: { announcement: RawAnnouncement; parsedOk: boolean }[],
): Promise<void> {
  if (results.length === 0) return;
  const now = new Date().toISOString();
  const rows = results.map(({ announcement, parsedOk }) => ({
    url: announcement.source.url,
    content_hash: articleHash(announcement),
    // A fresh row starts at one attempt; a repeat is counted by the increment
    // below, which reads the current value first.
    attempts: 1,
    parsed_ok: parsedOk,
    last_seen: now,
  }));

  // Attempts have to accumulate across runs, so a plain upsert of `attempts: 1`
  // would reset the count every time and defeat the cap. Read what is there and
  // add to it.
  const { data } = await client
    .from('seen_articles')
    .select('url, content_hash, attempts')
    .in('url', rows.map((row) => row.url));
  const existing = new Map(
    ((data ?? []) as { url: string; content_hash: string; attempts: number }[]).map((row) => [
      row.url,
      row,
    ]),
  );
  for (const row of rows) {
    const previous = existing.get(row.url);
    // A rewritten article starts its count again: it is a different text.
    if (previous && previous.content_hash === row.content_hash) {
      row.attempts = previous.attempts + 1;
    }
  }

  const { error } = await client.from('seen_articles').upsert(rows, { onConflict: 'url' });
  if (error) console.warn(`markRead: ${error.message}`);
}

// Over the text the model is actually shown, so a change to the page around it
// — a related-links block, a view counter — does not read as a rewrite.
function articleHash(announcement: RawAnnouncement): string {
  return createHash('sha256')
    .update(`${announcement.title}\u0000${announcement.body}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Closes stored outages that a follow-up article reports as repaired (§10.6).
 *
 * An open-ended fault is stored with `endsAt: null` because nobody knew when the
 * power would come back. When an outlet later says it did, that is the only real
 * end we will ever get, and writing it turns an assumption into a fact — the
 * display bound in `NO_END_ASSUMED_OVER_MS` stops being what decides the record.
 *
 * The repair time is the article's publication, which is an upper bound: the
 * power was back at or before it. That overstates the outage slightly and never
 * understates it, which is the right direction for an archive of how long places
 * were dark.
 *
 * Narrow on purpose, and narrower than it first was. Only rows that are
 * open-ended, uncancelled, in the same district, that name a place the repair
 * names, and that started inside the window below.
 *
 * The window is what the first version lacked, and a test against real data
 * found it immediately: a repair report for Yeniboğaziçi closed a fault from six
 * weeks earlier in the same village, writing an end that claimed those places
 * had been dark for forty-two days. A repair report is about a fault that is
 * still running or has just finished — an older one in the same place is a
 * different event, and leaving its end null is much better than filling it in
 * wrongly, because the display already bounds an unclosed fault.
 *
 * Twice NO_END_ASSUMED_OVER_MS: the display stops treating an unclosed fault as
 * running after that long, and this allows the same again for a report to
 * arrive late.
 */
const RESOLUTION_WINDOW_MS = 2 * NO_END_ASSUMED_OVER_MS;

export async function resolveOpenOutages(
  client: SupabaseClient,
  resolutions: Resolution[],
): Promise<number> {
  if (resolutions.length === 0) return 0;

  let closed = 0;
  for (const resolution of resolutions) {
    const { data, error } = await client
      .from('outages')
      .select('id, areas, starts_at')
      .eq('district', resolution.district)
      .is('ends_at', null)
      .is('cancelled_at', null)
      .lte('starts_at', resolution.resolvedAt)
      .gte(
        'starts_at',
        new Date(Date.parse(resolution.resolvedAt) - RESOLUTION_WINDOW_MS).toISOString(),
      );
    if (error) throw new Error(`resolveOpenOutages: ${error.message}`);

    const named = new Set(resolution.areas.map(foldKey));
    const ids = (data as { id: string; areas: string[] }[])
      .filter((row) => row.areas.some((area) => named.has(foldKey(area))))
      .map((row) => row.id);
    if (ids.length === 0) continue;

    const { error: updateError } = await client
      .from('outages')
      .update({ ends_at: resolution.resolvedAt })
      .in('id', ids)
      .is('ends_at', null);
    if (updateError) throw new Error(`resolveOpenOutages: ${updateError.message}`);
    closed += ids.length;
  }
  return closed;
}
