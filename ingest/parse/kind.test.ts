import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyKind, isCancellation, isResolved, looksLikeOutage } from './kind';

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
  assert.equal(looksLikeOutage('Elektrikler kesildi'), true);
  assert.equal(looksLikeOutage('Hurda kabloların satış ilanı'), false);
  assert.equal(looksLikeOutage('Orta Gerilim Switchgear Teknik Şartnameleri'), false);
});

// Both of these reached the review queue on the first live run.
test('looksLikeOutage is not fooled by words that merely start with "kesin"', () => {
  assert.equal(
    looksLikeOutage(
      'Yunanistan enerji çerçevesi: bu tür saldırılara kesinlikle müsaade edilmemelidir',
    ),
    false,
  );
  assert.equal(looksLikeOutage('İhale sonucu kesinleşti, enerji yatırımı başlıyor'), false);
});

test('looksLikeOutage rejects "kesintisiz", which means the opposite', () => {
  assert.equal(looksLikeOutage('Kesintisiz enerji kaynağı devreye alındı'), false);
});

// Real announcements give both reasons at once. Work announced ahead with a
// time window is planned; 'arıza' there names the reason, not an unplanned cut.
test('scheduled project work outranks an incidental fault mention', () => {
  assert.equal(
    classifyKind(
      'Orta gerilim elektrik şebekesinde yapılacak proje çalışması ve arıza tamiri nedeniyle bugün 09.00 – 11.00 arası iki saatlik elektrik kesintisi yapılacak.',
    ),
    'planned',
  );
});

test('a genuine fault with no scheduling language is still a fault', () => {
  assert.equal(classifyKind('Meydana gelen arıza nedeniyle elektrikler kesildi.'), 'fault');
  assert.equal(classifyKind('Direğe çarpan araç nedeniyle kopan hat onarılıyor.'), 'fault');
});

test('rotating still wins over both', () => {
  assert.equal(
    classifyKind('Üretim yetersizliği nedeniyle planlı dönüşümlü kesinti uygulanacaktır.'),
    'rotating',
  );
});

// The trap this list is written around: the story that prompted the open-ended
// fault record says "arızanın giderilmesi için çalışmalar devam ediyor" — the
// works to fix it are ongoing. A bare 'gideril' stem reads that as the fault
// being over, which is the opposite of what it says.
test('a fault being worked on is not a fault that is over', () => {
  assert.equal(
    isResolved('KIB-TEK, arızanın giderilmesi için çalışmaların devam ettiğini bildirdi.'),
    false,
  );
  assert.equal(isResolved('Bazı bölgelere elektrik verilemiyor.'), false);
});

test('a fault reported as fixed is recognised', () => {
  assert.equal(isResolved('Arıza giderildi, elektrikler yeniden verildi.'), true);
  assert.equal(isResolved('Kesinti sona erdi, şebeke normale döndü.'), true);
});
