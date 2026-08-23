import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldKey, htmlToText, similarity, stripApostropheSuffix, toLowerTr, toUpperTr } from './text';

// The dotted/dotless i is the edge case that silently corrupts place names, so
// it is asserted explicitly rather than trusted (SPEC §13 step 13).
test('toLowerTr folds the dotted and dotless i by Turkish rules', () => {
  assert.equal(toLowerTr('İSKELE'), 'iskele');
  assert.equal(toLowerTr('ISKELE'), 'ıskele');
  assert.equal(toLowerTr('İskele'), 'iskele');
  assert.equal(toLowerTr('KIBRIS'), 'kıbrıs');
  // A naive toLowerCase() leaves a combining dot on 'İ'; ours must not.
  assert.ok(!toLowerTr('İSKELE').includes('̇'));
});

test('toUpperTr raises i to the dotted capital', () => {
  assert.equal(toUpperTr('iskele'), 'İSKELE');
  assert.equal(toUpperTr('ısparta'), 'ISPARTA');
});

test('foldKey collapses every spelling of a place to one key', () => {
  const expected = 'gonyeli';
  for (const spelling of ['Gönyeli', 'Gonyeli', 'GÖNYELİ', 'GONYELI', 'gönyeli']) {
    assert.equal(foldKey(spelling), expected, spelling);
  }
  assert.equal(foldKey('Yeni Erenköy'), 'yeni erenkoy');
  assert.equal(foldKey('YENİ ERENKÖY'), 'yeni erenkoy');
  assert.equal(foldKey('Değirmenlik'), 'degirmenlik');
  assert.equal(foldKey('DEĞİRMENLİK'), 'degirmenlik');
  assert.equal(foldKey('Gazimağusa'), 'gazimagusa');
  assert.equal(foldKey('Çatalköy'), 'catalkoy');
  assert.equal(foldKey('Ulukışla'), 'ulukisla');
});

test('foldKey does not collide distinct places', () => {
  assert.notEqual(foldKey('Girne'), foldKey('Girne Merkez'));
  assert.notEqual(foldKey('Lefke'), foldKey('Lefkoşa'));
});

test('stripApostropheSuffix removes Turkish case suffixes', () => {
  assert.equal(stripApostropheSuffix("Gönyeli'de"), 'Gönyeli');
  assert.equal(stripApostropheSuffix("Lefkoşa'nın"), 'Lefkoşa');
  assert.equal(stripApostropheSuffix("Güzelyurt'ta bakım"), 'Güzelyurt bakım');
  assert.equal(stripApostropheSuffix('Girne bölgesinde'), 'Girne bölgesinde');
});

test('htmlToText strips markup and decodes the entities these feeds use', () => {
  const html = '<p>G&#246;nyeli&#8217;de<br/>elektrik  kesintisi</p><script>x=1</script>';
  assert.equal(htmlToText(html), 'Gönyeli’de\nelektrik kesintisi');
  assert.equal(htmlToText('<p>a &amp; b&nbsp;c</p>'), 'a & b c');
});

test('similarity scores near-misses high and unrelated words low', () => {
  assert.equal(similarity('gonyeli', 'gonyeli'), 1);
  assert.ok(similarity('gonyeli', 'gonyeli'.replace('y', '')) > 0.85);
  assert.ok(similarity('gonyeli', 'girne') < 0.5);
});
