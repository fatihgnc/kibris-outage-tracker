import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyKind, isCancellation, looksLikeOutage } from './kind';

test('maintenance wording classifies as planned', () => {
  assert.equal(classifyKind('bakım çalışmaları nedeniyle elektrik kesintisi yapılacaktır'), 'planned');
  assert.equal(classifyKind('şebeke yenileme projesi kapsamında'), 'planned');
  assert.equal(classifyKind('BAKIM ÇALIŞMASI NEDENİYLE'), 'planned');
});

test('fault wording classifies as fault', () => {
  assert.equal(classifyKind('arıza nedeniyle elektrik kesintisi yaşanmaktadır'), 'fault');
  assert.equal(classifyKind('ARIZA giderilene kadar'), 'fault');
  assert.equal(classifyKind('yıldırım düşmesi sonucu enerji kesildi'), 'fault');
});

test('rotating wording wins over the planned wording in the same sentence', () => {
  assert.equal(
    classifyKind('üretim yetersizliği nedeniyle planlı dönüşümlü kesinti uygulanacaktır'),
    'rotating',
  );
  assert.equal(classifyKind('yük atma programı uygulanacaktır'), 'rotating');
});

test('cancellations are detected', () => {
  assert.equal(isCancellation('Duyurulan kesinti iptal edilmiştir.'), true);
  assert.equal(isCancellation('Çalışma ertelenmiştir.'), true);
  assert.equal(isCancellation('Kesinti yapılacaktır.'), false);
});

test('looksLikeOutage filters tenders and press releases out of the feed', () => {
  assert.equal(looksLikeOutage('Yarın elektrik kesintisi yapılacaktır'), true);
  assert.equal(looksLikeOutage('Enerji kesilecektir'), true);
  assert.equal(looksLikeOutage('Hurda kabloların satış ilanı'), false);
  assert.equal(looksLikeOutage('Orta Gerilim Switchgear Teknik Şartnameleri'), false);
});
