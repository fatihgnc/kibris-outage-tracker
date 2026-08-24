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

// Copied from detaykibris.com/mesarya-bolgesinde-iki-saatlik-elektrik-kesintisi.
// "Vadili ağıllar" is the sheepfolds at Vadili, in Gazimağusa. Matched without
// regard to case it became the village Ağıllar, in İskele, and the announcement
// was split into a second record for a district it never mentioned — an outage
// reported to people who were not going to have one.
test('a common noun that is also a village name is not a place', () => {
  const matches = matchPlaces(
    'KIB-TEK’ten verilen bilgiye göre, kesintiden; Nergisli Köyü, Geçitkale Havaalanı, ' +
      'İnönü kavşağı bölgesi, Vadili Köyü, Vadili ağıllar, Vadili Sanayi Sitesi, ' +
      'Paşaköy ağıllar etkilenecek.',
  );
  const names = matches.map((m) => m.name);
  assert.ok(names.includes('Vadili'), 'the village itself still matches');
  assert.ok(names.includes('Nergisli'));
  assert.ok(names.includes('Paşaköy'));
  assert.ok(!names.includes('Ağıllar'), 'the sheepfolds are not the village Ağıllar');
  assert.deepEqual(districtsOf(matches), ['gazimagusa'], 'and the announcement stays in one district');
});

// The capital is what carries the distinction, so an outlet writing the whole
// list in caps must still resolve.
test('an all-caps list still matches even where a name doubles as a word', () => {
  const matches = matchPlaces('AGILLAR VADILI PASAKOY');
  assert.ok(matches.map((m) => m.name).includes('Ağıllar'));
});

