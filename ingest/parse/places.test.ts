import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allPlaces, districtsOf, matchAreas, matchPlaces } from './places';

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

// The model returns a list, and the list used to be joined with commas before
// matching — which erased the element boundaries, because the tokenizer strips
// punctuation. `data/places.json` carries an alias spelled 'Boğaz Girne', so two
// separate names matched as one place and the second was lost.
test('two names that each match on their own both survive', () => {
  const both = ['Boğaz(girne)', 'Girne(girne)'];
  assert.deepEqual(
    matchAreas(['Boğaz', 'Girne']).map((p) => `${p.name}(${p.district})`).sort(),
    [...both].sort(),
  );
  // Order-independently: it used to depend on which the model wrote first.
  assert.deepEqual(
    matchAreas(['Girne', 'Boğaz']).map((p) => `${p.name}(${p.district})`).sort(),
    [...both].sort(),
  );
});

// And the reason the join cannot simply be dropped: the model splits one name
// across two elements often enough, and matched apart 'Kaymaklı' is a different
// village. A wrong place is worse than a missing one.
test('a name split across two elements is put back together', () => {
  assert.deepEqual(matchAreas(['Küçük', 'Kaymaklı']).map((p) => p.name), ['Küçük Kaymaklı']);
  assert.deepEqual(matchAreas(['Lapta', 'Yolu']).map((p) => p.name), ['Lapta Yolu']);
  assert.deepEqual(matchAreas(['Aşağı', 'Bostancı']).map((p) => p.name), ['Aşağı Bostancı']);
});

test('joining reaches only its neighbour, and the rest of the list is untouched', () => {
  assert.deepEqual(
    matchAreas(['Yukarı', 'Yeşilırmak', 'Gemikonağı']).map((p) => p.name),
    ['Yukarı Yeşilırmak', 'Gemikonağı'],
  );
});

// What makes the rule above sound, stated as a property of the data rather than
// left as a comment: joining is needed exactly where one half of a two-word name
// means nothing on its own, and it is harmful exactly where both halves are
// places. Today that second set has one member. A new name that joins it would
// silently bring the old bug back, so this fails instead.
test('only one two-word spelling has both halves matching a place', () => {
  const spellings = new Set<string>();
  for (const place of allPlaces()) {
    spellings.add(place.name);
    for (const alias of place.aliases) spellings.add(alias);
  }
  const ambiguous = [...spellings]
    .filter((s) => s.trim().split(/\s+/).length === 2)
    .filter((s) => {
      const [a, b] = s.trim().split(/\s+/);
      return matchPlaces(a).length > 0 && matchPlaces(b).length > 0;
    });
  assert.deepEqual(ambiguous, ['Boğaz Girne']);
});
