import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceAdapter } from './adapters/types';
import { ingest } from './run';

// No key, so the parser cannot read anything and returns a failure without
// touching the network. That is exactly the shape this file needs: an
// announcement that lands in the review queue, which is the one path that has
// to survive a database error without losing the run.
delete process.env.OPENAI_API_KEY;

const UNPARSEABLE: SourceAdapter = {
  id: 'stub',
  fetch: async () => [
    {
      source: { name: 'Gündem Kıbrıs', url: 'https://example.invalid/run-test', kind: 'press' },
      title: 'Lefkoşa’da elektrik kesintisi',
      body: 'Elektrik kesintisi yapılacağı bildirildi.',
      publishedAt: '2026-08-26T05:00:00.000Z',
      fetchedAt: '2026-08-26T05:10:00.000Z',
    },
  ],
};

// Fails whichever table is named, records every ingest_runs row written.
// Reads answer empty: nothing has been seen before and nothing is stored, which
// is the state a first run meets.
function clientFailing(table: string, error: { code: string; message: string }) {
  const logged: Record<string, unknown>[] = [];
  const query = {
    select: () => query,
    in: () => query,
    gte: () => query,
    lte: () => query,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  const client = {
    from(name: string) {
      return {
        ...query,
        insert(payload: Record<string, unknown>) {
          if (name === 'ingest_runs') logged.push(payload);
          return Promise.resolve({ error: name === table ? error : null });
        },
        upsert() {
          return Promise.resolve({ error: name === table ? error : null });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, logged };
}

describe('a run that fails partway', () => {
  const broken = { code: '42703', message: 'column review_queue.reason does not exist' };

  // The failure this is here for: for two days every run threw on the review
  // queue, and because the run was logged last, nothing recorded that the
  // ingest had run at all. The status bar reads the latest logged run, so the
  // site told readers the sources were unreachable while they were being read
  // every twenty minutes.
  test('is still recorded', async () => {
    const { client, logged } = clientFailing('review_queue', broken);
    await assert.rejects(() => ingest({ adapters: [UNPARSEABLE], client }));
    assert.equal(logged.length, 1, 'the run is logged even though a step threw');
  });

  test('still fails, so the job goes red', async () => {
    const { client } = clientFailing('review_queue', broken);
    await assert.rejects(
      () => ingest({ adapters: [UNPARSEABLE], client }),
      /column review_queue.reason does not exist/,
    );
  });

  // The review queue is the maintainer's work list. Marking the data stale
  // because that write failed would put a warning in front of readers about
  // data which is, in fact, current.
  test('is recorded ok when only the review queue failed', async () => {
    const { client, logged } = clientFailing('review_queue', broken);
    await assert.rejects(() => ingest({ adapters: [UNPARSEABLE], client }));
    assert.equal(logged[0].ok, true);
  });
});

// An article that could not be read is never marked as read: the next run has
// to be able to try again, or a transient API failure loses the announcement
// for good.
test('an announcement that failed to parse reaches the review queue', async () => {
  const queued: Record<string, unknown>[] = [];
  const query = {
    select: () => query,
    in: () => query,
    gte: () => query,
    lte: () => query,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  const client = {
    from(name: string) {
      return {
        ...query,
        insert(payload: Record<string, unknown>) {
          if (name === 'review_queue') queued.push(payload);
          return Promise.resolve({ error: null });
        },
        upsert() {
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;

  await ingest({ adapters: [UNPARSEABLE], client });
  assert.equal(queued.length, 1);
  // The raw text is kept so a person can see what the parser could not.
  assert.match(String(queued[0].raw_text), /Elektrik kesintisi/);
});
