import assert from 'node:assert/strict';
import { test } from 'node:test';
import { looksLikeOutage } from './kind';

test('an outage announcement is recognised', () => {
  assert.equal(looksLikeOutage('Gönyeli bölgesinde elektrik kesintisi yapılacaktır.'), true);
  assert.equal(looksLikeOutage('Arıza nedeniyle elektrikler kesildi.'), true);
});

// The filter runs on every crawled article, and the outlets publish tenders and
// tariffs through the same listings. Letting those through costs a request each.
test('other news from the same outlets is not', () => {
  assert.equal(looksLikeOutage('KIB-TEK yeni tarife açıkladı.'), false);
  assert.equal(looksLikeOutage('Belediye su kesintisi duyurdu.'), false);
  // 'verildi' on its own is not a restoration: approvals are granted with the
  // same verb, and the outlets run those stories constantly.
  assert.equal(looksLikeOutage('Elektrik zammına onay verildi.'), false);
});

// A repair report is what turns the display's assumption into a fact (§10.6),
// and it can only do that if the crawl hands it to the model in the first place.
// None of these says 'kesinti' anywhere.
test('a report that the power is back is recognised', () => {
  assert.equal(looksLikeOutage('Lefke bölgesindeki arıza giderildi, elektrikler yeniden verildi.'), true);
  assert.equal(looksLikeOutage('Girne bölgesinde enerji verildi.'), true);
  assert.equal(looksLikeOutage('Elektrik sistemi normale döndü.'), true);
});

// Not a repair — works still going on. It matches anyway, and should: the model
// draws that line, and an article about a running fault belongs in the crawl.
test('works still in progress reach the model too', () => {
  assert.equal(
    looksLikeOutage('Arızanın giderilmesi için çalışmalar devam ediyor, elektrik yok.'),
    true,
  );
});

test('the near-miss words that broke the first live run', () => {
  // 'kesinlikle' is not 'kesinti'.
  assert.equal(looksLikeOutage('Elektrik zammı kesinlikle gündemde değil.'), false);
  // 'kesintisiz' is the opposite word.
  assert.equal(looksLikeOutage('Hastaneye kesintisiz elektrik sağlanacak.'), false);
});
