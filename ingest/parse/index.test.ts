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
              weekday: null,
              start: '09:00',
              end: '13:00',
              areas: ['Gönyeli'],
              cancelled: false,
              ongoing: false,
              resolved: false,
              restoredAt: null,
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

// The review queue exists to answer "why could this not be read", so a record
// dropped for want of a clock must not be reported as a place problem — that
// sends the next reader to data/places.json over a parser question.
test('a record with no usable time says so, and does not blame the places', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    // Planned work with no start: the publication-time stand-in is only for a
    // fault the model reports as ongoing, so there is no schedule to build.
    respondWith([{ start: null, end: null, ongoing: false }]),
  );
  assert.equal(outcome.status, 'failed');
  if (outcome.status !== 'failed') return;
  assert.equal(outcome.reason, 'no usable time in the announcement');
});

test('both failures in one announcement are both named', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([
      { start: null, end: null, ongoing: false },
      { areas: ['Bilinmeyen Mahalle'] },
    ]),
  );
  assert.equal(outcome.status, 'failed');
  if (outcome.status !== 'failed') return;
  assert.equal(outcome.reason, 'no usable time, and no known place names');
});

// Announcements say "perşembe günü" constantly, and the model cannot resolve
// one: asked against a Sunday it answered Tuesday five times out of five, and
// went on doing so after being told the publication date's weekday outright. It
// reports the day it read; the counting is done here, where it is a subtraction.
test('a named weekday is counted from the publication date, not by the model', async () => {
  // 2026-08-23 is a Sunday; the Thursday after it is the 27th.
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-08-23T14:00:00.000Z' }),
    // The model's own date is deliberately wrong here — it must be ignored.
    respondWith([{ weekday: 'thursday', date: '2026-08-25' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records[0].startsAt, '2026-08-27T06:00:00.000Z');
});

// On or after, not after: KIB-TEK publishes on the Wednesday that the work is
// "perşembe günü", and one published on the day itself says it too.
test('a weekday that is today means today', async () => {
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-08-23T14:00:00.000Z' }),
    respondWith([{ weekday: 'sunday' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records[0].startsAt, '2026-08-23T06:00:00.000Z');
});

// Published at 01:00 Nicosia, which is still the previous day in UTC. The
// counting has to start from the day the reader is living in.
test('the weekday counts from the Nicosia day, not the UTC one', async () => {
  const outcome = await parseAnnouncement(
    // 2026-08-23T22:00Z is 01:00 on the 24th in Nicosia — a Monday.
    announcement({ publishedAt: '2026-08-23T22:00:00.000Z' }),
    respondWith([{ weekday: 'monday' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records[0].startsAt, '2026-08-24T06:00:00.000Z');
});

test('an article the model finds no outage in is skipped, not failed', async () => {
  const outcome = await parseAnnouncement(announcement(), respondWith([]));
  assert.equal(outcome.status, 'skipped');
});

test('a retraction is reported as one', async () => {
  const outcome = await parseAnnouncement(announcement(), respondWith([{ cancelled: true }]));
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records.length, 0);
  assert.equal(outcome.retractions.length, 1);
  assert.deepEqual(outcome.retractions[0].areas, ['Gönyeli']);
});

// One article can call off Thursday's work and announce Saturday's in the same
// breath. A single flag for the whole announcement sent both to retractOutages:
// the new outage was never stored, and anything stored that resembled it was
// cancelled as well.
test('an article that cancels one outage and announces another does both', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([
      { cancelled: true, areas: ['Gönyeli'] },
      { areas: ['Lapta'], date: '2026-08-29' },
    ]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.deepEqual(
    outcome.retractions.map((r) => r.areas),
    [['Gönyeli']],
  );
  assert.deepEqual(
    outcome.records.map((r) => r.areas),
    [['Lapta']],
  );
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

// A follow-up article saying the fault is fixed closes the record rather than
// adding one. These articles rarely say when the fault began, so the repair is
// read before the schedule — demanding a start would throw it away.
test('a repair report becomes a resolution, not a record', async () => {
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-08-26T15:00:00.000Z' }),
    respondWith([{ kind: 'fault', resolved: true, start: null, ongoing: false, areas: ['Yeniboğaziçi'] }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records.length, 0);
  assert.deepEqual(outcome.resolutions, [
    {
      district: 'gazimagusa',
      areas: ['Yeniboğaziçi'],
      // An upper bound: the power was back at or before this.
      resolvedAt: '2026-08-26T15:00:00.000Z',
    },
  ]);
});

// The article that prompted this: a fault at 16:00, power back "saat 18.30
// itibariyla", filed at 19:55. Reading 18:30 as a start put a fault on the map
// beginning at the moment it in fact ended — and even read correctly, closing
// the record at the filing time would claim ninety minutes of darkness that
// nobody sat through.
test('the announced restoration time closes the record, not the filing time', async () => {
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-07-15T16:55:00.000Z' }),
    respondWith([
      { kind: 'fault', resolved: true, start: '16:00', restoredAt: '18:30', areas: ['Yeniboğaziçi'] },
    ]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records.length, 0);
  // 18:30 Nicosia in July is 15:30 UTC, an hour and a half before the article.
  assert.equal(outcome.resolutions[0].resolvedAt, '2026-07-15T15:30:00.000Z');
});

// A repair filed just after midnight is about the evening before.
test('a restoration time after publication belongs to the day before', async () => {
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-07-15T21:10:00.000Z' }), // 00:10 local, the 16th
    respondWith([{ kind: 'fault', resolved: true, start: null, restoredAt: '23:50', areas: ['Yeniboğaziçi'] }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.resolutions[0].resolvedAt, '2026-07-15T20:50:00.000Z');
});

// Nothing usable stands in for the publication time; it is still an upper bound.
test('an unusable restoration time falls back to the publication time', async () => {
  const outcome = await parseAnnouncement(
    announcement({ publishedAt: '2026-08-26T15:00:00.000Z' }),
    respondWith([{ kind: 'fault', resolved: true, start: null, restoredAt: '25:99', areas: ['Yeniboğaziçi'] }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.resolutions[0].resolvedAt, '2026-08-26T15:00:00.000Z');
});

test('a repair naming nowhere we know is not a resolution', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ resolved: true, start: null, areas: ['Bilinmeyen Mahalle'] }]),
  );
  assert.equal(outcome.status, 'failed');
});

// Every district name is also a settlement name, so the announcement is the only
// thing that can say which was meant (§10.4).
test('a district reading survives where the record names its own district', async () => {
  const outcome = await parseAnnouncement(
    announcement({ body: 'Lefke bölgesinde elektrik kesintisi yaşanacaktır.' }),
    respondWith([{ areas: ['Lefke'], scope: 'district' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records[0].district, 'lefke');
  assert.equal(outcome.records[0].scope, 'district');
});

// The guard against a model that saw a district word somewhere in the article
// and widened the whole announcement on the strength of it.
test('a district reading is dropped where the record names no district', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ areas: ['Gemikonağı'], scope: 'district' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records[0].district, 'lefke');
  assert.equal(outcome.records[0].scope, 'places');
});

test('across two districts only the one named as a district is district-scope', async () => {
  const outcome = await parseAnnouncement(
    announcement(),
    respondWith([{ areas: ['Lefke', 'Gönyeli'], scope: 'district' }]),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  const byDistrict = new Map(outcome.records.map((r) => [r.district, r]));
  assert.equal(byDistrict.get('lefke')?.scope, 'district');
  assert.equal(byDistrict.get('lefkosa')?.scope, 'places');
});

// The property the whole backfill rests on: correcting a record's scope has to
// update the row it is about, not open a second one beside it.
test('two records differing only in scope share an id', async () => {
  const read = async (scope: 'places' | 'district') => {
    const outcome = await parseAnnouncement(
      announcement(),
      respondWith([{ areas: ['Lefke'], scope }]),
    );
    assert.equal(outcome.status, 'parsed');
    if (outcome.status !== 'parsed') throw new Error('unreachable');
    return outcome.records[0];
  };
  const narrow = await read('places');
  const wide = await read('district');
  assert.notEqual(narrow.scope, wide.scope);
  assert.equal(narrow.id, wide.id);
});
