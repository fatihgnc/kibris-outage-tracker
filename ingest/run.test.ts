import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceAdapter } from './adapters/types';
import { ingest } from './run';

// An announcement that is plainly an outage but carries no time range, so
// Stage 1 fails it, the fallback is off, and it lands in the review queue —
// the one path that has to survive a database error without losing the run.
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
function clientFailing(table: string, error: { code: string; message: string }) {
  const logged: Record<string, unknown>[] = [];
  const client = {
    from(name: string) {
      return {
        insert(payload: Record<string, unknown>) {
          if (name === 'ingest_runs') logged.push(payload);
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
    await assert.rejects(() => ingest({ adapters: [UNPARSEABLE], useFallback: false, client }));
    assert.equal(logged.length, 1, 'the run is logged even though a step threw');
  });

  test('still fails, so the job goes red', async () => {
    const { client } = clientFailing('review_queue', broken);
    await assert.rejects(
      () => ingest({ adapters: [UNPARSEABLE], useFallback: false, client }),
      /column review_queue.reason does not exist/,
    );
  });

  // The review queue is the maintainer's work list. Marking the data stale
  // because that write failed would put a warning in front of readers about
  // data which is, in fact, current.
  test('is recorded ok when only the review queue failed', async () => {
    const { client, logged } = clientFailing('review_queue', broken);
    await assert.rejects(() => ingest({ adapters: [UNPARSEABLE], useFallback: false, client }));
    assert.equal(logged[0].ok, true);
  });
});
