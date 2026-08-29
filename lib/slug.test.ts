import assert from 'node:assert/strict';
import test from 'node:test';
import { addressable, outageIdPrefix, outageSlug, placeSlug } from './slug';
import { findSettlementBySlug, settlementSlugs } from './geography';
import { areaKeyOf } from './places';
import { foldKey } from '../ingest/parse/text';

test('a place name folds to an ASCII URL segment', () => {
  assert.equal(placeSlug('Küçük Kaymaklı'), 'kucuk-kaymakli');
  assert.equal(placeSlug('Yeniboğaziçi'), 'yenibogazici');
  assert.equal(placeSlug('Gönyeli'), 'gonyeli');
  // The spellings announcements actually use reach the same page as the display
  // name — that is the whole point of folding rather than slugifying.
  assert.equal(placeSlug('YENIBOGAZICI'), 'yenibogazici');
  assert.equal(placeSlug('Yeni Erenköy'), 'yeni-erenkoy');
});

// Two settlements folding to one segment would leave one of them permanently
// unreachable, and nothing else in the codebase would notice.
test('no two settlements share a URL segment', () => {
  const seen = new Map<string, string>();
  for (const { slug, settlement } of settlementSlugs()) {
    const clash = seen.get(slug);
    assert.equal(clash, undefined, `"${settlement.name}" and "${clash}" both fold to "${slug}"`);
    seen.set(slug, settlement.name);
  }
});

// A settlement page asks the database for records by folded place name, and it
// only has the URL segment to go on. If these two ever stop being reversible,
// every settlement page silently reports an empty history.
test('a URL segment converts back to the key stored in area_keys', () => {
  for (const { slug, settlement } of settlementSlugs()) {
    assert.equal(areaKeyOf(slug), foldKey(settlement.name));
  }
});

test('every settlement segment resolves back to its settlement', () => {
  for (const { slug, settlement } of settlementSlugs()) {
    assert.equal(findSettlementBySlug(slug)?.name, settlement.name);
  }
  assert.equal(findSettlementBySlug('not-a-place'), null);
});

const record = {
  id: 'a3f19c2b7d4e5f60112233445566778899aabbcc',
  startsAt: '2026-08-26T06:30:00.000Z',
  district: 'guzelyurt' as const,
  areas: ['Yuvacık', 'Zümrütköy'],
};

test('an outage slug reads as a date, a district and a place', () => {
  assert.equal(outageSlug(record), '2026-08-26-guzelyurt-yuvacik-a3f19c2b');
});

// Nicosia runs ahead of UTC, so an evening outage would otherwise be filed
// under the following day.
test('the date in a slug is the island date, not the UTC one', () => {
  assert.equal(
    outageSlug({ ...record, startsAt: '2026-08-26T22:30:00.000Z' }),
    '2026-08-27-guzelyurt-yuvacik-a3f19c2b',
  );
});

test('a record with no named places still gets an address', () => {
  assert.equal(outageSlug({ ...record, areas: [] }), '2026-08-26-guzelyurt-a3f19c2b');
});

test('the id prefix is read back out of a slug', () => {
  assert.equal(outageIdPrefix(outageSlug(record)!), 'a3f19c2b');
  // A merge can rewrite the readable half after the link was shared; the old
  // address must still find the record.
  assert.equal(outageIdPrefix('2026-01-01-lefkosa-somewhere-else-a3f19c2b'), 'a3f19c2b');
  assert.equal(outageIdPrefix('2026-08-26-guzelyurt-yuvacik'), null);
  assert.equal(outageIdPrefix('a3f19c2b'), null);
});

// The development database had four live rows put in by hand — 'res-recent-…',
// 'aaa1-…' — whose ids are not fingerprints. Their first eight characters are
// not hex, so a slug built from them cannot be read back, and every card
// linking to one pointed at a 404.
test('a record whose id is not a fingerprint has no address', () => {
  assert.equal(outageSlug({ ...record, id: 'res-recent-s3fquj' }), null);
  assert.equal(outageSlug({ ...record, id: 'aaa1-mtbfz9c5' }), null);
  assert.equal(outageSlug({ ...record, id: 'short' }), null);
  // Hex for the first eight is the whole requirement; the rest may be anything.
  assert.equal(outageSlug({ ...record, id: 'a3f19c2b-whatever' }), '2026-08-26-guzelyurt-yuvacik-a3f19c2b');
});

// The guarantee every list depends on: what `addressable` hands back can always
// be resolved again.
test('addressable drops what it cannot address and round-trips the rest', () => {
  const entries = addressable([record, { ...record, id: 'res-recent-s3fquj' }]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].record.id, record.id);
  assert.equal(outageIdPrefix(entries[0].slug), record.id.slice(0, 8));
});
