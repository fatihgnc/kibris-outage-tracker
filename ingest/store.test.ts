import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outage, SourceRef } from '../lib/types';
import { createServiceClient } from './supabase';
import { dedupe } from './dedupe';
import { queueForReview, retractOutages, storeOutages } from './store';

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
    // Nothing to clean up: this run's window is its own.
    await reachable();
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
});
