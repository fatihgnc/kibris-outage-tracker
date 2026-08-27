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
});

test('the near-miss words that broke the first live run', () => {
  // 'kesinlikle' is not 'kesinti'.
  assert.equal(looksLikeOutage('Elektrik zammı kesinlikle gündemde değil.'), false);
  // 'kesintisiz' is the opposite word.
  assert.equal(looksLikeOutage('Hastaneye kesintisiz elektrik sağlanacak.'), false);
});
