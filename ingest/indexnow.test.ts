import assert from 'node:assert/strict';
import test from 'node:test';
import { changedPaths, pingIndexNow } from './indexnow';
import { PLACE_PAGE_MIN_RECORDS } from '../lib/places';
import type { Outage } from '../lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const record: Outage = {
  id: 'a3f19c2b7d4e5f60112233445566778899aabbcc',
  utility: 'electricity',
  kind: 'planned',
  startsAt: '2026-08-26T06:00:00.000Z',
  endsAt: '2026-08-26T10:00:00.000Z',
  district: 'lefkosa',
  areas: ['Gönyeli', 'Hamitköy'],
  sources: [{ name: 'KIB-TEK', url: 'https://example.invalid', kind: 'official' }],
  publishedAt: '2026-08-25T14:00:00.000Z',
  ingestedAt: '2026-08-25T14:10:00.000Z',
  confidence: 'high',
  scope: 'places',
};

// Gönyeli has a page, Hamitköy does not.
const counts = new Map([
  ['gonyeli', PLACE_PAGE_MIN_RECORDS],
  ['hamitkoy', PLACE_PAGE_MIN_RECORDS - 1],
]);

test('a written record names every page it changes, in both locales', () => {
  const paths = changedPaths([record], counts);
  assert.deepEqual(paths.sort(), [
    '/en',
    '/en/district/lefkosa',
    '/en/outage/2026-08-26-lefkosa-gonyeli-a3f19c2b',
    '/en/place/gonyeli',
    '/tr',
    '/tr/bolge/lefkosa',
    '/tr/kesinti/2026-08-26-lefkosa-gonyeli-a3f19c2b',
    '/tr/yer/gonyeli',
  ].sort());
});

// Submitting a URL that answers 404 is how a host gets its submissions ignored,
// so the threshold that decides whether a settlement page exists has to be the
// same one the site and the sitemap use.
test('a settlement below the threshold is not submitted', () => {
  const paths = changedPaths([record], counts);
  assert.ok(!paths.some((p) => p.includes('hamitkoy')));
});

test('a record with no addressable id still names its district and the home page', () => {
  const paths = changedPaths([{ ...record, id: 'res-recent-s3fquj' }], counts);
  assert.ok(!paths.some((p) => p.includes('/kesinti/') || p.includes('/outage/')));
  assert.ok(paths.includes('/tr/bolge/lefkosa'));
  assert.ok(paths.includes('/tr'));
});

test('two records in one district do not repeat its page', () => {
  const paths = changedPaths([record, { ...record, id: 'bbbb1111ccccddddeeeeffff00001111' }], counts);
  assert.equal(paths.filter((p) => p === '/tr/bolge/lefkosa').length, 1);
});

// The configuration checks run before anything else, so a checkout without the
// secret — a local run, a fork — announces nothing. The client is never touched
// on these paths, so passing a stub that would throw proves it.
const unusableClient = new Proxy({}, {
  get() {
    throw new Error('the database must not be reached when IndexNow is not configured');
  },
}) as SupabaseClient;

test('nothing is submitted without a key or a site', async (t) => {
  const before = { key: process.env.INDEXNOW_KEY, site: process.env.NEXT_PUBLIC_SITE_URL };
  t.after(() => {
    process.env.INDEXNOW_KEY = before.key;
    process.env.NEXT_PUBLIC_SITE_URL = before.site;
  });

  delete process.env.INDEXNOW_KEY;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.example.com';
  assert.match((await pingIndexNow(unusableClient, [record])).skipped ?? '', /INDEXNOW_KEY/);

  process.env.INDEXNOW_KEY = 'abc';
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.match((await pingIndexNow(unusableClient, [record])).skipped ?? '', /NEXT_PUBLIC_SITE_URL/);

  // A developer with the key in their shell and the site pointing at their
  // laptop must not tell four search engines about localhost.
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  assert.match((await pingIndexNow(unusableClient, [record])).skipped ?? '', /refusing/);

  // A run that wrote nothing changed nothing.
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.example.com';
  assert.match((await pingIndexNow(unusableClient, [])).skipped ?? '', /nothing was written/);
});
