import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Outage, SourceRef } from '../lib/types';
import { dedupe, isSameEvent, mergeOutages } from './dedupe';

const OFFICIAL: SourceRef = { name: 'KIB-TEK', url: 'https://kibtek.com/a', kind: 'official' };
const PRESS: SourceRef = { name: 'Yenidüzen', url: 'https://yeniduzen.com/b', kind: 'press' };
const PRESS2: SourceRef = { name: 'Gündem Kıbrıs', url: 'https://gundemkibris.com/c', kind: 'press' };

function outage(overrides: Partial<Outage> = {}): Outage {
  return {
    id: 'seed',
    utility: 'electricity',
    kind: 'planned',
    startsAt: '2026-08-23T06:00:00.000Z',
    endsAt: '2026-08-23T12:00:00.000Z',
    district: 'lefkosa',
    areas: ['Gönyeli', 'Hamitköy'],
    sources: [OFFICIAL],
    publishedAt: '2026-08-22T14:00:00.000Z',
    ingestedAt: '2026-08-22T14:10:00.000Z',
    confidence: 'high',
    ...overrides,
  };
}

test('identical events from different sources are the same event', () => {
  assert.equal(isSameEvent(outage(), outage({ sources: [PRESS] })), true);
});

test('an abbreviated place list is the same event as the full one', () => {
  const full = outage({ areas: ['Gönyeli', 'Hamitköy', 'Alayköy'] });
  const abbreviated = outage({ areas: ['Gönyeli'], sources: [PRESS] });
  assert.equal(isSameEvent(full, abbreviated), true);
});

test('times rounded by an outlet still match', () => {
  const rounded = outage({
    startsAt: '2026-08-23T06:10:00.000Z',
    endsAt: '2026-08-23T12:00:00.000Z',
    sources: [PRESS],
  });
  assert.equal(isSameEvent(outage(), rounded), true);
});

test('a different day is a different event', () => {
  const other = outage({ startsAt: '2026-08-24T06:00:00.000Z', endsAt: '2026-08-24T12:00:00.000Z' });
  assert.equal(isSameEvent(outage(), other), false);
});

test('the same times in another district is a different event', () => {
  assert.equal(isSameEvent(outage(), outage({ district: 'girne', areas: ['Lapta'] })), false);
});

test('merging takes the union of areas, not the official list alone', () => {
  const official = outage({ areas: ['Gönyeli', 'Hamitköy'] });
  const press = outage({ areas: ['Gönyeli', 'Alayköy'], sources: [PRESS] });
  const merged = mergeOutages(official, press);
  assert.deepEqual([...merged.areas].sort(), ['Alayköy', 'Gönyeli', 'Hamitköy']);
});

test('merging keeps the earliest publication and orders sources official-first', () => {
  const press = outage({
    sources: [PRESS],
    publishedAt: '2026-08-22T13:00:00.000Z', // the outlet was faster
  });
  const merged = mergeOutages(press, outage({ sources: [OFFICIAL] }));
  assert.equal(merged.publishedAt, '2026-08-22T13:00:00.000Z');
  assert.equal(merged.sources[0].kind, 'official');
  assert.equal(merged.sources.length, 2);
});

test('official field values win over press ones when they conflict', () => {
  const press = outage({ kind: 'planned', sources: [PRESS], confidence: 'low' });
  const official = outage({ kind: 'fault', sources: [OFFICIAL] });
  assert.equal(mergeOutages(press, official).kind, 'fault');
  assert.equal(mergeOutages(press, official).confidence, 'high');
});

// Renumbering a record when a new source widens its area list would make every
// run write a fresh row instead of updating the existing one.
test('merging keeps the existing id so re-running stays idempotent', () => {
  const stored = outage({ id: 'stored-id', areas: ['Gönyeli'] });
  const incoming = outage({ id: 'incoming-id', areas: ['Gönyeli', 'Alayköy'], sources: [PRESS] });
  const merged = mergeOutages(stored, incoming);
  assert.equal(merged.id, 'stored-id');
  assert.deepEqual([...merged.areas].sort(), ['Alayköy', 'Gönyeli']);
  // Merging the already-merged record again changes nothing.
  const again = mergeOutages(merged, incoming);
  assert.equal(again.id, 'stored-id');
  assert.deepEqual(again.areas, merged.areas);
  assert.equal(again.sources.length, merged.sources.length);
});

// This is the check SPEC 13 step 15 asks for after adding each adapter: the
// record count must not grow when another source reports the same event.
test('five sources reporting one event collapse to a single record', () => {
  const arrivals = [
    outage({ sources: [OFFICIAL], areas: ['Gönyeli', 'Hamitköy'] }),
    outage({ sources: [PRESS], areas: ['Gönyeli'] }),
    outage({ sources: [PRESS2], areas: ['Gönyeli', 'Hamitköy', 'Alayköy'] }),
    outage({ sources: [PRESS], startsAt: '2026-08-23T06:05:00.000Z' }),
    outage({ sources: [PRESS2], areas: ['Hamitköy'] }),
    outage({ sources: [OFFICIAL] }),
  ];
  const collapsed = dedupe(arrivals);
  assert.equal(collapsed.length, 1);
  assert.deepEqual([...collapsed[0].areas].sort(), ['Alayköy', 'Gönyeli', 'Hamitköy']);
  assert.equal(collapsed[0].sources.length, 3);
});

test('dedupe is order-independent, ids included', () => {
  const records = [
    outage({ id: 'b', sources: [PRESS], areas: ['Gönyeli'] }),
    outage({ id: 'a', sources: [OFFICIAL], areas: ['Gönyeli', 'Alayköy'] }),
    outage({ id: 'c', district: 'girne', areas: ['Lapta'], sources: [PRESS2] }),
  ];
  const forward = dedupe(records);
  const backward = dedupe([...records].reverse());
  assert.deepEqual(
    forward.map((r) => r.id).sort(),
    backward.map((r) => r.id).sort(),
  );
  assert.equal(forward.length, 2);
  // The smallest id of a merged group survives, whatever order they arrived.
  assert.ok(forward.some((r) => r.id === 'a'));
});

test('a fault with an unknown end does not merge with a bounded outage', () => {
  const open = outage({ endsAt: null, kind: 'fault' });
  assert.equal(isSameEvent(open, outage()), false);
});
