import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allPlaces, districtsOf, matchPlaces } from './places';

test('every place carries a canonical name and a valid district', () => {
  const places = allPlaces();
  assert.ok(places.length >= 60);
  for (const place of places) {
    assert.ok(place.name.length > 1, place.name);
    assert.ok(Array.isArray(place.aliases));
  }
});

test('matches place names in running announcement prose', () => {
  const matches = matchPlaces(
    "Gönyeli, Hamitköy ve Alayköy'de yarın elektrik kesintisi yapılacaktır.",
  );
  assert.deepEqual(
    matches.map((m) => m.name),
    ['Gönyeli', 'Hamitköy', 'Alayköy'],
  );
  assert.ok(matches.every((m) => m.district === 'lefkosa'));
  assert.ok(matches.every((m) => !m.fuzzy));
});

// Outlets publish the affected settlements as an all-caps list with the
// Turkish characters dropped; this is the form that breaks naive matching.
test('matches the all-caps ASCII list style outlets use', () => {
  const matches = matchPlaces('ALAYKOY DEGIRMENLIK GIRNE GUZELYURT ISKELE LAPTA LEFKE LEFKOSA TATLISU');
  const names = matches.map((m) => m.name);
  for (const expected of ['Alayköy', 'Değirmenlik', 'Girne', 'Güzelyurt', 'İskele', 'Lapta', 'Lefke', 'Lefkoşa', 'Tatlısu']) {
    assert.ok(names.includes(expected), `missing ${expected} in ${names.join(', ')}`);
  }
});

test('prefers the longest multi-word name over the words inside it', () => {
  const matches = matchPlaces('Yeni Erenköy ve Dipkarpaz bölgelerinde');
  assert.deepEqual(
    matches.map((m) => m.name),
    ['Yeni Erenköy', 'Dipkarpaz'],
  );
});

test('does not confuse Lefke with Lefkoşa', () => {
  assert.deepEqual(
    matchPlaces('Lefke bölgesinde').map((m) => m.name),
    ['Lefke'],
  );
  assert.deepEqual(
    matchPlaces('Lefkoşa bölgesinde').map((m) => m.name),
    ['Lefkoşa'],
  );
});

test('a near-miss spelling matches but is flagged fuzzy for review', () => {
  // 'Değirmenlk' — a dropped letter, not one of the listed aliases.
  const matches = matchPlaces('Değirmenlk bölgesinde elektrik kesintisi');
  const match = matches.find((m) => m.name === 'Değirmenlik');
  assert.ok(match, `expected Değirmenlik, got ${matches.map((m) => m.name).join(', ')}`);
  assert.equal(match.fuzzy, true);
});

test('a listed alias matches exactly, not fuzzily', () => {
  const match = matchPlaces('Gemikonagi bölgesinde').find((m) => m.name === 'Gemikonağı');
  assert.ok(match);
  assert.equal(match.fuzzy, false);
});

test('unrelated prose matches nothing', () => {
  assert.deepEqual(matchPlaces('Kurum yönetim kurulu toplantısı yapıldı.'), []);
});

test('districtsOf returns each district once, in first-seen order', () => {
  const matches = matchPlaces('Lapta, Gönyeli, Alsancak ve Hamitköy');
  assert.deepEqual(districtsOf(matches), ['girne', 'lefkosa']);
});
