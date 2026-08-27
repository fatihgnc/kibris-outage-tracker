import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outage, SourceRef } from '../lib/types';
import { createServiceClient } from './supabase';
import { dedupe } from './dedupe';
import { queueForReview, resolveOpenOutages, retractOutages, storeOutages } from './store';

// Round-trip against a local Supabase (`npx supabase start`). Skipped when one
// is not reachable, so the suite still runs without Docker.
const OFFICIAL: SourceRef = { name: 'KIB-TEK', url: 'https://kibtek.com/t1', kind: 'official' };
const PRESS_A: SourceRef = { name: 'Yenidüzen', url: 'https://yeniduzen.com/t1', kind: 'press' };
const PRESS_B: SourceRef = { name: 'Gündem Kıbrıs', url: 'https://gundemkibris.com/t1', kind: 'press' };

let client: SupabaseClient | null = null;

async function reachable(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const candidate = createServiceClient();
    const { error } = await candidate.from('outages').select('id').limit(1);
    if (error) return false;
    client = candidate;
    return true;
  } catch {
    return false;
  }
}

// A far-future window, so the fixtures never collide with real rows, and a
// fresh day and id prefix per run, so they never collide with each other.
//
// The obvious setup — one fixed window wiped in `before` — cannot work here:
// the schema grants the ingest no delete (§10.6), so the wipe silently does
// nothing and every run inherits the previous run's rows. That was survivable
// only while an upsert quietly cleared `cancelled_at`, which is precisely the
// revival bug these tests exist to rule out. Giving each run its own window
// removes the shared state instead of relying on a delete that never happens.
const RUN = `${Date.now().toString(36)}`;
const RUN_DAY = new Date(Date.UTC(2099, 0, 1) + (Date.now() % 3_000) * 86400000);
const isoAt = (hour: number) =>
  new Date(Date.UTC(RUN_DAY.getUTCFullYear(), RUN_DAY.getUTCMonth(), RUN_DAY.getUTCDate(), hour)).toISOString();

const START = isoAt(6);
const END = isoAt(12);
const id = (name: string) => `${name}-${RUN}`;

function outage(name: string, areas: string[], sources: SourceRef[]): Outage {
  return {
    id: id(name),
    utility: 'electricity',
    kind: 'planned',
    startsAt: START,
    endsAt: END,
    district: 'lefkosa',
    areas,
    sources,
    publishedAt: isoAt(0),
    ingestedAt: isoAt(1),
    confidence: 'high',
  };
}

async function currentRows() {
  const { data, error } = await client!
    .from('outages')
    .select('id, areas, sources, cancelled_at, cancelled_reason')
    .eq('starts_at', START);
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    areas: string[];
    sources: SourceRef[];
    cancelled_at: string | null;
    cancelled_reason: string | null;
  }[];
}

describe('store round-trip', () => {
  before(async () => {
    // No Docker or no local stack: these tests skip, the rest still run.
    if (!(await reachable())) return;
    // This run's own window needs no cleaning, but earlier runs' windows stay
    // in the table for good — the schema grants no delete. Retiring them as bad
    // data is what that flag is for, and it keeps them out of the archive and
    // out of scripts/audit-records.ts, which would otherwise report a growing
    // pile of fixtures it cannot re-derive.
    await client!
      .from('outages')
      .update({ cancelled_at: new Date().toISOString(), cancelled_reason: 'bad_data' })
      .gte('starts_at', '2099-01-01T00:00:00.000Z')
      // Every fixture window except this one. Run windows are picked at random
      // within the far-future range rather than in sequence, so "older" cannot
      // be expressed as a date comparison. Rows the retraction test cancelled
      // are relabelled too: a fixture is not a retraction, whatever the test
      // did to it on the way past.
      .neq('starts_at', START);
  });

  // The invariant SPEC §13 step 15 asks to check after adding each adapter.
  test('adding sources for one event never grows the row count', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    const first = await storeOutages(client!, dedupe([outage('aaa1', ['Gönyeli', 'Hamitköy'], [OFFICIAL])]));
    assert.equal(first.created, 1);
    assert.equal((await currentRows()).length, 1);

    // A second outlet reports the same event with an abbreviated place list.
    const second = await storeOutages(client!, dedupe([outage('bbb2', ['Gönyeli'], [PRESS_A])]));
    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);

    // A third adds a village the others left out.
    await storeOutages(client!, dedupe([outage('ccc3', ['Gönyeli', 'Alayköy'], [PRESS_B])]));

    const rows = await currentRows();
    assert.equal(rows.length, 1, `expected one row, got ${rows.length}`);
    assert.equal(rows[0].id, id('aaa1'), 'the original id must survive the merges');
    assert.deepEqual([...rows[0].areas].sort(), ['Alayköy', 'Gönyeli', 'Hamitköy']);
    assert.equal(rows[0].sources.length, 3);
    assert.equal(rows[0].sources[0].kind, 'official');
  });

  test('re-running the same batch changes nothing', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    const batch = dedupe([
      outage('aaa1', ['Gönyeli', 'Hamitköy'], [OFFICIAL]),
      outage('bbb2', ['Gönyeli'], [PRESS_A]),
      outage('ccc3', ['Gönyeli', 'Alayköy'], [PRESS_B]),
    ]);
    const result = await storeOutages(client!, batch);
    assert.equal(result.created, 0);
    const rows = await currentRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id('aaa1'));
  });

  // Corrections are updates; the row stays for the archive (§10.6).
  test('a cancellation retracts the record without deleting it', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    const retracted = await retractOutages(client!, [outage('aaa1', ['Gönyeli'], [OFFICIAL])]);
    assert.equal(retracted, 1);
    const rows = await currentRows();
    assert.equal(rows.length, 1, 'the row must survive the retraction');
    assert.ok(rows[0].cancelled_at, 'the row must be marked cancelled');
    assert.equal(rows[0].cancelled_reason, 'retracted', 'a retraction is not bad data');
  });

  // The ingest re-reads the same announcement every few minutes, so a retracted
  // record's fingerprint comes round again on the very next run. The upsert used
  // to carry `cancelled_at: null` in its payload and quietly revive it — an
  // outage the utility had called off reappeared on the site as if it were still
  // happening, and a record retired as bad data came back with it.
  test('a later run does not revive a retracted record', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    await storeOutages(client!, dedupe([outage('aaa1', ['Gönyeli', 'Hamitköy'], [OFFICIAL])]));
    const rows = await currentRows();
    const revived = rows.find((row) => row.id === id('aaa1'));
    assert.ok(revived, 'the retracted row is still there');
    assert.ok(revived.cancelled_at, 'and it is still cancelled');
  });

  // The queue is one person's work list, and an announcement the parser cannot
  // read is still there at the next poll. Without this it grew by a row per
  // run: three runs by hand put the same item in three times.
  //
  // Asserted as an invariant rather than from a clean slate, because the schema
  // grants the ingest no delete on this table — an item that has been queued is
  // resolved, never removed — so the fixture row from an earlier run is
  // expected to still be there.
  test('an unparseable announcement is queued once, however often it is seen', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    const item = {
      source: { name: 'Gündem Kıbrıs', url: 'https://example.invalid/store-test-review' },
      rawText: 'Fixture: an announcement with no time range in it at all.',
      reason: 'no time range found',
    };
    const rows = async () => {
      const { count } = await client!
        .from('review_queue')
        .select('*', { count: 'exact', head: true })
        .eq('raw_text', item.rawText);
      return count ?? 0;
    };

    await queueForReview(client!, [item]);
    assert.equal(await rows(), 1, 'one sighting leaves exactly one row');
    assert.equal(await queueForReview(client!, [item]), 0, 'a second sighting adds nothing');
    assert.equal(await queueForReview(client!, [item, item]), 0, 'nor does a batch repeating it');
    assert.equal(await rows(), 1, 'still exactly one row');
  });

  // The repeat above is the ordinary case, and for two days it ended the run
  // instead: the unique violation came back from the database, queueForReview
  // threw, and the ingest died before it could log the run. Stated separately
  // from the counts, because a count of zero and a raised error are the same
  // number of rows and very different behaviour.
  test('a repeat is tolerated, not raised', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    const item = {
      source: { name: 'Gündem Kıbrıs', url: `https://example.invalid/store-test-raises-${RUN}` },
      rawText: `Fixture: a second announcement the parser cannot read. ${RUN}`,
      reason: 'no time range found',
    };

    assert.equal(await queueForReview(client!, [item]), 1, 'the first sighting is queued');
    await assert.doesNotReject(() => queueForReview(client!, [item]), 'a repeat must not throw');
  });

  // A batch carrying both is the shape a real run produces: one announcement
  // already on the list from the last poll, one seen for the first time. The
  // new one has to survive the repeat sitting next to it.
  test('a repeat in a batch does not cost the new item beside it', async (t) => {
    if (!client) return t.skip('no local Supabase reachable');
    const seen = {
      source: { name: 'Gündem Kıbrıs', url: `https://example.invalid/store-test-seen-${RUN}` },
      rawText: `Fixture: already on the list. ${RUN}`,
      reason: 'no time range found',
    };
    const fresh = {
      source: { name: 'Gündem Kıbrıs', url: `https://example.invalid/store-test-fresh-${RUN}` },
      rawText: `Fixture: seen for the first time. ${RUN}`,
      reason: 'no known place names found',
    };

    await queueForReview(client!, [seen]);
    assert.equal(await queueForReview(client!, [seen, fresh]), 1, 'only the new one counts');
    const { count } = await client!
      .from('review_queue')
      .select('*', { count: 'exact', head: true })
      .eq('raw_text', fresh.rawText);
    assert.equal(count, 1, 'and it really reached the table');
  });
});

// Runs without Docker, and that is the point: on CI the round-trip tests above
// skip for want of a local Supabase, so nothing there would have caught this.
// The failure was a duplicate the database reported and the code re-raised,
// which a fake client reproduces exactly and cheaply.
describe('queueForReview against a stubbed client', () => {
  function clientReturning(...errors: ({ code: string; message: string } | null)[]) {
    const attempts: Record<string, unknown>[] = [];
    let call = 0;
    const client = {
      from() {
        return {
          insert(payload: Record<string, unknown>) {
            attempts.push(payload);
            return Promise.resolve({ error: errors[call++] ?? null });
          },
        };
      },
    };
    return { client: client as unknown as SupabaseClient, attempts };
  }

  const item = {
    source: { name: 'Gündem Kıbrıs', url: 'https://example.invalid/stub' },
    rawText: 'Fixture text.',
    reason: 'no time range found',
  };

  test('a unique violation is not counted and not raised', async () => {
    const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const { client } = clientReturning(duplicate);
    assert.equal(await queueForReview(client, [item]), 0);
  });

  test('a repeat does not stop the items behind it being queued', async () => {
    const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const { client, attempts } = clientReturning(duplicate, null);
    assert.equal(await queueForReview(client, [item, { ...item, rawText: 'Another.' }]), 1);
    assert.equal(attempts.length, 2, 'the second item is still attempted');
  });

  // Anything else is a real fault — a dropped connection, a column that moved —
  // and must still end the run rather than being swallowed with the repeats.
  test('any other error still ends the run', async () => {
    const broken = { code: '42703', message: 'column review_queue.reason does not exist' };
    const { client } = clientReturning(broken);
    await assert.rejects(() => queueForReview(client, [item]), /queueForReview: column/);
  });
});

describe('resolveOpenOutages', () => {
  let live = false;
  before(async () => {
    live = await reachable();
  });

  // Inserted straight into the table rather than through storeOutages: that
  // merges an incoming record into any stored event it matches, so the rows
  // would land under ids this test does not know. What is under test here is
  // which rows a repair report reaches, nothing else.
  const insertOpenFault = async (id: string, startsAt: string, areas: string[]) => {
    const { error } = await client!.from('outages').upsert(
      {
        id,
        utility: 'electricity',
        kind: 'fault',
        starts_at: startsAt,
        ends_at: null,
        district: 'guzelyurt',
        areas,
        sources: [PRESS_A],
        published_at: startsAt,
        ingested_at: startsAt,
        confidence: 'low',
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(error.message);
  };

  const endOf = async (id: string) => {
    const { data } = await client!.from('outages').select('ends_at').eq('id', id).single();
    return (data as { ends_at: string | null } | null)?.ends_at ?? null;
  };

  const retire = async (id: string) => {
    await client!
      .from('outages')
      .update({ cancelled_at: new Date().toISOString(), cancelled_reason: 'bad_data' })
      .eq('id', id);
  };

  // The window this checks was missing from the first version, and a run against
  // real data found the hole at once: a repair report for Yeniboğaziçi closed a
  // fault from six weeks earlier in the same village, writing an end that
  // claimed those places had been dark for forty-two days.
  test('closes the fault the repair is about, and not an older one', async (t) => {
    if (!live || !client) return t.skip('no local Supabase');
    const run = Math.random().toString(36).slice(2, 8);
    const resolvedAt = '2026-08-26T14:36:00.000Z';
    const recent = `res-recent-${run}`;
    const ancient = `res-old-${run}`;
    await insertOpenFault(recent, '2026-08-26T12:36:00.000Z', ['Zümrütköy']);
    await insertOpenFault(ancient, '2026-07-15T15:30:00.000Z', ['Zümrütköy']);

    const closed = await resolveOpenOutages(client, [
      { district: 'guzelyurt', areas: ['Zümrütköy'], resolvedAt },
    ]);
    assert.equal(closed, 1);
    assert.equal(await endOf(recent), resolvedAt.replace('.000Z', '+00:00'));
    // Leaving it null is much better than filling it in wrongly: the display
    // already bounds an unclosed fault.
    assert.equal(await endOf(ancient), null, 'the six-week-old one is left alone');

    await retire(recent);
    await retire(ancient);
  });

  test('a repair naming a place the fault does not touch closes nothing', async (t) => {
    if (!live || !client) return t.skip('no local Supabase');
    const run = Math.random().toString(36).slice(2, 8);
    const id = `res-elsewhere-${run}`;
    await insertOpenFault(id, '2026-08-26T12:36:00.000Z', ['Zümrütköy']);

    const closed = await resolveOpenOutages(client, [
      { district: 'guzelyurt', areas: ['Kalkanlı'], resolvedAt: '2026-08-26T14:36:00.000Z' },
    ]);
    assert.equal(closed, 0);
    assert.equal(await endOf(id), null);

    await retire(id);
  });
});
