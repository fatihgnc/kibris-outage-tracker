import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupSiblings } from './events';
import type { Outage } from './types';

const base: Outage = {
  id: 'a',
  utility: 'electricity',
  kind: 'fault',
  startsAt: '2026-08-29T09:29:00.000Z',
  endsAt: null,
  district: 'girne',
  areas: ['Girne'],
  scope: 'district',
  sources: [{ name: 'Kıbrıs Postası', url: 'https://example.invalid/1', kind: 'press' }],
  publishedAt: '2026-08-29T09:29:00.000Z',
  ingestedAt: '2026-08-29T09:40:00.000Z',
  confidence: 'low',
};
const record = (patch: Partial<Outage>): Outage => ({ ...base, ...patch });

// The case that prompted this: one island-wide fault, three district records,
// one of them closed by a repair report and two not.
test('district-wide records of one event become one card, led by the open one', () => {
  const cards = groupSiblings([
    record({ id: 'lefke', district: 'lefke', endsAt: '2026-09-01T05:45:00.000Z' }),
    record({ id: 'girne', district: 'girne' }),
    record({ id: 'guzelyurt', district: 'guzelyurt', startsAt: '2026-08-29T09:31:00.000Z' }),
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].lead.id, 'girne');
  assert.deepEqual(cards[0].siblings, [
    { district: 'lefke', endsAt: '2026-09-01T05:45:00.000Z' },
    { district: 'guzelyurt', endsAt: null },
  ]);
});

test('a different kind, a different hour, or a named place is not a sibling', () => {
  const cards = groupSiblings([
    record({ id: 'girne' }),
    record({ id: 'planned', district: 'lefke', kind: 'planned' }),
    record({ id: 'later', district: 'lefke', startsAt: '2026-08-29T10:00:00.000Z' }),
    record({ id: 'places', district: 'lefke', scope: 'places', areas: ['Lefke'] }),
  ]);
  assert.deepEqual(
    cards.map((card) => card.lead.id),
    ['girne', 'planned', 'later', 'places'],
  );
  assert.ok(cards.every((card) => card.siblings.length === 0));
});

test('order and every record survive: nothing is merged away', () => {
  const input = [
    record({ id: 'one', district: 'iskele', startsAt: '2026-08-20T06:00:00.000Z' }),
    record({ id: 'two', district: 'girne' }),
    record({ id: 'three', district: 'lefke' }),
  ];
  const cards = groupSiblings(input);
  assert.deepEqual(cards.map((card) => card.lead.id), ['one', 'two']);
  assert.equal(cards[1].siblings.length, 1);
});
