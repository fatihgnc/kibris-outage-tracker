import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveStatus, NO_END_ASSUMED_OVER_MS } from './time';

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

test('the assumed end is twelve hours', () => {
  assert.equal(NO_END_ASSUMED_OVER_MS, 12 * 60 * 60 * 1000);
});

// The assumption is only ever a reading of the record. A repair report writes a
// real end (§10.6), and once one is there it decides, early or late.
test('a real end wins over the assumption, in both directions', () => {
  const start = '2026-08-26T06:00:00.000Z';
  const closedEarly = outage(start, '2026-08-26T08:00:00.000Z');
  assert.equal(deriveStatus(closedEarly, at(start) + 3 * 60 * 60 * 1000), 'past');

  const ranLong = outage(start, '2026-08-27T06:00:00.000Z');
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
