import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnnouncement, type RawAnnouncement } from './index';

const source = { name: 'Kıbrıs Postası', url: 'https://example.invalid/a', kind: 'press' as const };
const announce = (title: string, body: string, publishedAt: string): RawAnnouncement => ({
  source,
  title,
  body,
  publishedAt,
  fetchedAt: publishedAt,
});

// Taken from a real story the ingest threw away: a lorry hit a medium-voltage
// line, several villages lost power, and no hours are given anywhere because
// nobody knows when it comes back. Stage 1 failed it for 'no time range found'
// and the outage never appeared. 78 of the first 82 stored records were planned
// outages, and this is why.
const LORRY_TITLE = 'Bazı bölgelerde elektrik kesintisi: Elektrik hatlarına iş aracı çarptı';
const LORRY_BODY =
  'Bir iş aracının orta gerilim elektrik hatlarına çarpması sonucu meydana gelen hasar ve kopma ' +
  'nedeniyle bazı bölgelere elektrik verilemiyor. Kıbrıs Türk Elektrik Kurumu’ndan (KIB-TEK) ' +
  'yapılan açıklamaya göre, bugün meydana gelen olay nedeniyle Yeniboğaziçi köyü, Yakın Doğu ' +
  'Hastanesi bölgesi, Eski Tuzla köyü bölgesi ile Tuzla girişi karting bölgelerinde elektrik ' +
  'kesintisi yaşanıyor. KIB-TEK, arızanın giderilmesi için çalışmaların devam ettiğini bildirdi.';

test('an ongoing fault with no hours is recorded, open ended', () => {
  const outcome = parseAnnouncement(announce(LORRY_TITLE, LORRY_BODY, '2026-08-26T12:36:00.000Z'));
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.equal(outcome.records.length, 1);
  const [record] = outcome.records;
  assert.equal(record.kind, 'fault');
  assert.equal(record.district, 'gazimagusa');
  // The announcement's own time stands in for a start nobody published.
  assert.equal(record.startsAt, '2026-08-26T12:36:00.000Z');
  assert.equal(record.endsAt, null);
  assert.deepEqual(record.areas.sort(), ['Tuzla', 'Yeniboğaziçi']);
});

test('a fault already reported as fixed is not turned into a live outage', () => {
  const outcome = parseAnnouncement(
    announce(
      'Yeniboğaziçi bölgesindeki elektrik arızası giderildi',
      'Yeniboğaziçi köyünde yaşanan elektrik kesintisine neden olan arıza giderildi, ' +
        'elektrikler yeniden verildi.',
      '2026-08-26T15:00:00.000Z',
    ),
  );
  assert.equal(outcome.status, 'failed');
});

// Planned work always states its hours, so a missing range there means the parse
// went wrong. Standing a time in would put an invented window on a card.
test('planned work still has to state its hours', () => {
  const outcome = parseAnnouncement(
    announce(
      'Gönyeli’de planlı elektrik kesintisi',
      'Şebeke iyileştirme çalışması nedeniyle Gönyeli bölgesinde elektrik kesintisi yapılacaktır.',
      '2026-08-26T06:00:00.000Z',
    ),
  );
  assert.equal(outcome.status, 'failed');
  if (outcome.status !== 'failed') return;
  assert.equal(outcome.reason, 'no time range found');
});

test('a fault that does state its hours keeps them', () => {
  const outcome = parseAnnouncement(
    announce(
      'Arıza nedeniyle kesinti',
      'Meydana gelen arıza nedeniyle Lapta bölgesinde 09.00 ile 15.00 saatleri arasında ' +
        'elektrik kesintisi yaşanacaktır.',
      '2026-08-26T05:00:00.000Z',
    ),
  );
  assert.equal(outcome.status, 'parsed');
  if (outcome.status !== 'parsed') return;
  assert.notEqual(outcome.records[0].endsAt, null);
});
