import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_END_ASSUMED_OVER_MS, deriveStatus, formatDuration, zonedTimeToUtc } from './time';

const at = (iso: string) => Date.parse(iso);
const outage = (startsAt: string, endsAt: string | null) => ({ startsAt, endsAt });

test('an announced window decides the status', () => {
  const o = outage('2026-08-26T06:00:00.000Z', '2026-08-26T10:00:00.000Z');
  assert.equal(deriveStatus(o, at('2026-08-26T05:00:00.000Z')), 'upcoming');
  assert.equal(deriveStatus(o, at('2026-08-26T08:00:00.000Z')), 'active');
  assert.equal(deriveStatus(o, at('2026-08-26T11:00:00.000Z')), 'past');
});

// `endsAt: null` means nobody said when the power comes back, which is the
// ordinary case for a fault in progress. Read literally it means forever: the
// live window is thirty days, so a fault repaired in two hours could hold
// villages dark on the map for weeks. Nothing else ever corrects that.
test('an outage with no announced end does not stay active forever', () => {
  const start = '2026-08-26T06:00:00.000Z';
  const o = outage(start, null);
  assert.equal(deriveStatus(o, at(start)), 'active');
  assert.equal(deriveStatus(o, at(start) + NO_END_ASSUMED_OVER_MS - 1000), 'active');
  assert.equal(deriveStatus(o, at(start) + NO_END_ASSUMED_OVER_MS + 1000), 'past');
});

test('the assumed end is seventy-two hours', () => {
  assert.equal(NO_END_ASSUMED_OVER_MS, 72 * 60 * 60 * 1000);
});

// The assumption is only ever a reading of the record. A repair report writes a
// real end (§10.6), and once one is there it decides, early or late.
test('a real end wins over the assumption, in both directions', () => {
  const start = '2026-08-26T06:00:00.000Z';
  const closedEarly = outage(start, '2026-08-26T08:00:00.000Z');
  assert.equal(deriveStatus(closedEarly, at(start) + 3 * 60 * 60 * 1000), 'past');

  const ranLong = outage(start, '2026-08-30T06:00:00.000Z');
  assert.equal(deriveStatus(ranLong, at(start) + NO_END_ASSUMED_OVER_MS + 1000), 'active');
});

test('an outage that has not started is upcoming, announced end or not', () => {
  const now = at('2026-08-26T05:00:00.000Z');
  assert.equal(deriveStatus(outage('2026-08-26T06:00:00.000Z', null), now), 'upcoming');
  assert.equal(
    deriveStatus(outage('2026-08-26T06:00:00.000Z', '2026-08-26T10:00:00.000Z'), now),
    'upcoming',
  );
});

// "2 sa 0 dk" is how long nobody says something lasted. An outage page prints
// this under the hours, and a countdown ticks through it every hour.
test('a duration never ends in a zero unit', () => {
  const units = { day: 'gün', hour: 'sa', minute: 'dk' };
  const ms = (h: number, m = 0) => (h * 60 + m) * 60000;
  assert.equal(formatDuration(ms(2), units), '2 sa');
  assert.equal(formatDuration(ms(2, 30), units), '2 sa 30 dk');
  assert.equal(formatDuration(ms(1, 59), units), '1 sa 59 dk');
  assert.equal(formatDuration(ms(24), units), '1 gün');
  assert.equal(formatDuration(ms(26), units), '1 gün 2 sa');
  assert.equal(formatDuration(ms(0, 45), units), '45 dk');
  assert.equal(formatDuration(ms(0, 0), units), '0 dk');
});

// There were no daylight-saving tests at all, which is how the gap below sat
// there unnoticed: it is wrong one night a year and silent about it.
const nicosiaClock = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Nicosia',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms);

test('an ordinary local time round-trips', () => {
  assert.equal(nicosiaClock(zonedTimeToUtc(2026, 6, 15, 9, 0)), '09:00');
  assert.equal(nicosiaClock(zonedTimeToUtc(2026, 1, 15, 9, 0)), '09:00');
});

// Cyprus jumps 03:00 to 04:00 on the last Sunday of March, so no instant that
// night reads as 03:30. The search cannot converge, and it used to return what
// it happened to be holding: 02:30, an hour before the announcement said, stored
// at full confidence. Resolved forward now, as every date library does.
test('a local time inside the spring-forward gap resolves forward, never back', () => {
  assert.equal(nicosiaClock(zonedTimeToUtc(2027, 3, 28, 2, 30)), '02:30'); // before the jump
  assert.equal(nicosiaClock(zonedTimeToUtc(2027, 3, 28, 3, 0)), '04:00'); // gap opens
  assert.equal(nicosiaClock(zonedTimeToUtc(2027, 3, 28, 3, 30)), '04:30');
  assert.equal(nicosiaClock(zonedTimeToUtc(2027, 3, 28, 3, 59)), '04:59'); // gap closes
  assert.equal(nicosiaClock(zonedTimeToUtc(2027, 3, 28, 4, 30)), '04:30'); // after the jump
});

// The autumn hour is the opposite case and needs no rescue: 03:30 happens twice
// and both are real instants, so the search lands on one of them and reads back
// as asked.
test('an ambiguous local time in autumn still reads back as itself', () => {
  assert.equal(nicosiaClock(zonedTimeToUtc(2026, 10, 25, 3, 30)), '03:30');
});
