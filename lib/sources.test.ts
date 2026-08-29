import assert from 'node:assert/strict';
import test from 'node:test';
import { articleKey, dedupeSources } from './sources';
import type { SourceRef } from './types';

const press = (url: string, name = 'Kıbrıs Postası'): SourceRef => ({ name, url, kind: 'press' });

// The case this exists for: one Kıbrıs Postası article, stored twice because
// the outlet rewrote the slug from "yarın" to "bugün" on the morning of the
// work. Both URLs carry the same article number.
test('a rewritten slug is the same article', () => {
  const a = 'https://www.kibrispostasi.com/c35-KIBRIS_HABERLERI/n611748-yuvacik-ve-cevresinde-yarin-iki-saatlik-elektrik-kesintisi';
  const b = 'https://www.kibrispostasi.com/c35-KIBRIS_HABERLERI/n611748-yuvacik-ve-cevresinde-bugun-09301130-saatleri-arasinda-elektrik-kesintisi';
  assert.equal(articleKey(a), articleKey(b));
  assert.deepEqual(dedupeSources([press(a), press(b)]), [press(a)]);
});

test('the numbered .htm outlets are keyed the same way', () => {
  assert.equal(
    articleKey('https://www.detaykibris.com/2-saatlik-elektrik-kesintisi-357966h.htm'),
    articleKey('https://www.detaykibris.com/tamamen-baska-bir-baslik-357966h.htm'),
  );
  assert.notEqual(
    articleKey('https://www.detaykibris.com/girnenin-bazi-bolgelerinde-elektrik-kesintisi-357532h.htm'),
    articleKey('https://www.detaykibris.com/girnede-persembe-laptada-cuma-gunu-elektrik-kesintisi-357503h.htm'),
  );
  assert.equal(
    articleKey('https://www.yeniduzen.com/bafrada-elektrik-kesintisi-176634h.htm'),
    'yeniduzen.com#176634',
  );
});

// One outlet genuinely runs several pieces on one outage — an announcement,
// then a reminder. Collapsing by name would throw away real links, and across
// the stored archive that is what almost every same-outlet pair is.
test('two different articles from one outlet both survive', () => {
  const a = press('https://www.gundemkibris.com/lefkosada-bircok-bolgeye-elektrik-verilemeyecek', 'Gündem Kıbrıs');
  const b = press('https://www.gundemkibris.com/lefkosada-yarin-bircok-bolgeye-elektrik-verilemeyecek', 'Gündem Kıbrıs');
  assert.equal(dedupeSources([a, b]).length, 2);
});

test('the same address with and without www is one source', () => {
  const a = press('https://gundemkibris.com/bazi-bolgelerde-kesinti', 'Gündem Kıbrıs');
  const b = press('https://www.gundemkibris.com/bazi-bolgelerde-kesinti', 'Gündem Kıbrıs');
  assert.equal(dedupeSources([a, b]).length, 1);
});

test('different outlets are never collapsed, whatever their urls look like', () => {
  const a = press('https://www.detaykibris.com/x-357966h.htm', 'Detay Kıbrıs');
  const b = press('https://www.yeniduzen.com/y-357966h.htm', 'Yenidüzen');
  assert.equal(dedupeSources([a, b]).length, 2);
});

test('the earliest entry is the one kept, and order is otherwise preserved', () => {
  const official: SourceRef = { name: 'KIB-TEK', url: 'https://kibtek.com/a', kind: 'official' };
  const first = press('https://www.kibrispostasi.com/c35-X/n1-first');
  const repeat = press('https://www.kibrispostasi.com/c35-X/n1-rewritten');
  assert.deepEqual(dedupeSources([official, first, repeat]), [official, first]);
});

test('an unparseable source is kept rather than lost', () => {
  const broken = press('not a url at all');
  assert.deepEqual(dedupeSources([broken]), [broken]);
  assert.equal(articleKey('not a url at all'), 'not a url at all');
});
