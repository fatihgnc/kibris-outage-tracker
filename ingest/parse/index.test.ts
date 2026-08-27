import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnnouncement, type RawAnnouncement } from './index';
import type { ExtractedOutage } from './llm';

// The model's reading is stubbed. What is under test is everything that happens
// to its answer afterwards — place resolution, the district, time zones, the
// stand-in start, the fingerprint — which is the half of the parser that has to
// be deterministic (§10.4).
function respondWith(outages: Partial<ExtractedOutage>[]): typeof fetch {
  const body = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            outages: outages.map((o) => ({
              kind: 'planned',
              date: '2026-08-26',
              start: '09:00',
              end: '13:00',
              areas: ['Gönyeli'],
              cancelled: false,
              ongoing: false,
              ...o,
            })),
          }),
        },
      },
    ],
  };
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

const announcement = (overrides: Partial<RawAnnouncement> = {}): RawAnnouncement => ({
  source: { name: 'Kıbrıs Postası', url: 'https://example.invalid/a', kind: 'press' },
  title: 'Elektrik kesintisi',
  body: 'Gönyeli bölgesinde elektrik kesintisi yapılacaktır.',
  publishedAt: '2026-08-26T05:00:00.000Z',
  fetchedAt: '2026-08-26T05:05:00.000Z',
  ...overrides,
});

test.before(() => {
  process.env.OPENAI_API_KEY = 'test-key';
});

test('a read announcement becomes a record with our own place data', async () => {
  const outcome = await parseAnnouncement(announcement(), respondWith([{}]));
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  const [record] = outcome.records;
  // The district comes from data/places.json, never from the model.
  assert.equal(record.district, 'lefkosa');
  assert.deepEqual(record.areas, ['Gönyeli']);
  assert.equal(record.kind, 'planned');
  assert.equal(record.confidence, 'high');
  // 09:00 Nicosia in August is 06:00 UTC — the conversion is ours, not the
  // model's, and goes through the same function the site reads back with.
  assert.equal(record.startsAt, '2026-08-26T06:00:00.000Z');
  assert.equal(record.endsAt, '2026-08-26T10:00:00.000Z');
});

test('the announcement spelling is resolved to the canonical one', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ areas: ['YENIBOGAZICI'] }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  // Without this the map cannot light a lamp for it (§3.2).
  assert.deepEqual(outcome.records[0].areas, ['Yeniboğaziçi']);
  assert.equal(outcome.records[0].district, 'gazimagusa');
});

test('one announcement spanning districts becomes one record each', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ areas: ['Gönyeli', 'Lapta'] }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.deepEqual(outcome.records.map((r) => r.district).sort(), ['girne', 'lefkosa']);
});

// The story that prompted the rewrite: a lorry hit a line, several villages lost
// power, and no clock appears anywhere because nobody knows when it comes back.
test('an ongoing fault with no start uses the publication time, open ended', async () => {
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-08-26T12:36:00.000Z' }),
    respondWith([
      { kind: 'fault', start: null, end: null, ongoing: true, areas: ['Yeniboğaziçi'] },
    ]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  const [record] = outcome.records;
  assert.equal(record.startsAt, '2026-08-26T12:36:00.000Z');
  assert.equal(record.endsAt, null);
  // The one value not read off the page, and the record says so.
  assert.equal(record.confidence, 'low');
});

// Only a fault in progress earns a stand-in. Planned work always states its
// hours, so a missing one means the reading went wrong, and inventing a start
// would print a made-up window on a card.
test('planned work with no start is not given one', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ kind: 'planned', start: null, ongoing: false }]),
  );
  assert.equal(outcome.status, 'failed');
});

test('a fault reported as already over is not given one either', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ kind: 'fault', start: null, ongoing: false }]),
  );
  assert.equal(outcome.status, 'failed');
});

test('an outage running past midnight ends the next day', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ start: '22:00', end: '02:00' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  const [record] = outcome.records;
  assert.ok(Date.parse(record.endsAt!) > Date.parse(record.startsAt));
  assert.equal(record.endsAt, '2026-08-26T23:00:00.000Z');
});

// A place the model invented, or mangled past recognition, must not reach the
// database as somewhere that does not exist.
test('names that match nothing we know are not stored', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ areas: ['Bilinmeyen Mahalle'] }]),
  );
  assert.equal(outcome.status, 'failed');
  if (outcome.status !== 'failed') return;
  assert.equal(outcome.reason, 'no known place names found');
});

test('an article the model finds no outage in is skipped, not failed', async () => {
  const outcome = await parseAnnouncement(announcement(), respondWith([]));
  assert.equal(outcome.status, 'skipped');
});

test('a retraction is reported as one', async () => {
  const outcome = await parseAnnouncement(announcement(), respondWith([{ cancelled: true }]));
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.cancellation, true);
});

// An API failure is not a parse result. It has to reach the review queue with
// its raw text rather than looking like an article with no outage in it.
test('a failed request fails the announcement rather than skipping it', async () => {
  const refuse = (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
  const outcome = await parseAnnouncement(announcement(), refuse);
  assert.equal(outcome.status, 'failed');
  if (outcome.status !== 'failed') return;
  assert.match(outcome.reason, /429/);
  // The text is carried through so a person can see what was lost.
  assert.match(outcome.text, /Gönyeli/);
});

test('two runs of the same announcement produce the same id', async () => {
  const once = await parseAnnouncement(announcement(), respondWith([{}]));
  const twice = await parseAnnouncement(announcement(), respondWith([{}]));
  assert.equal(once.status, 'parsed');
  assert.equal(twice.status, 'parsed');
  if (once.status !== 'parsed' || twice.status !== 'parsed') return;
  assert.equal(once.records[0].id, twice.records[0].id);
});
