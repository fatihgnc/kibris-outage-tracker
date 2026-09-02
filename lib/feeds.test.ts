import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIcs, buildRss, feedPath } from './feeds';
import type { ArchivedOutage } from './types';

const site = new URL('https://kesintimivar.com');
const base: ArchivedOutage = {
  id: 'a3f19c2b7d4e5f60112233445566778899aabbcc',
  utility: 'electricity',
  kind: 'planned',
  startsAt: '2026-08-26T06:00:00.000Z',
  endsAt: '2026-08-26T10:00:00.000Z',
  district: 'girne',
  areas: ['Lapta', 'Alsancak'],
  scope: 'places',
  sources: [{ name: 'KIB-TEK', url: 'https://example.invalid/1', kind: 'official' }],
  publishedAt: '2026-08-25T14:00:00.000Z',
  ingestedAt: '2026-08-25T14:10:00.000Z',
  confidence: 'high',
  cancelled: false,
};

test('feeds live outside the locale tree, with an extension the proxy skips', () => {
  assert.equal(feedPath('girne', 'calendar'), '/feed/girne/calendar.ics');
  assert.equal(feedPath('girne', 'rss'), '/feed/girne/rss.xml');
});

test('announced work is a calendar event; a fault and a cancellation are not', () => {
  const ics = buildIcs(
    'girne',
    [
      base,
      { ...base, id: 'bbbb1111ccccddddeeeeffff000011112222', kind: 'fault', endsAt: null },
      { ...base, id: 'cccc1111ccccddddeeeeffff000011112222', cancelled: true },
    ],
    site,
  );
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 1);
  assert.match(ics, /DTSTART:20260826T060000Z\r\n/);
  assert.match(ics, /DTEND:20260826T100000Z\r\n/);
  assert.match(ics, /UID:a3f19c2b7d4e5f60112233445566778899aabbcc@kesintimivar.com/);
  // Commas in the text are escaped, and the event links to its own page.
  assert.match(ics, /SUMMARY:PLANLI · Girne — Lapta\\, Alsancak/);
  assert.match(ics, /URL:https:\/\/kesintimivar.com\/tr\/kesinti\/2026-08-26-girne-lapta-a3f19c2b/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('no line is longer than 75 octets', () => {
  const ics = buildIcs('girne', [{ ...base, areas: Array(12).fill('Karaoğlanoğlu') }], site);
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  }
  // And folding is reversible: the unfolded summary is the original text.
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:PLANLI · Girne — (Karaoğlanoğlu\\, ){11}Karaoğlanoğlu/);
});

test('the feed names the district page, and every record its own', () => {
  const rss = buildRss('girne', [base, { ...base, id: 'dddd1111ccccddddeeeeffff000011112222', cancelled: true }], site);
  assert.match(rss, /<title>Girne elektrik kesintileri<\/title>/);
  assert.match(rss, /<link>https:\/\/kesintimivar.com\/tr\/bolge\/girne<\/link>/);
  assert.match(rss, /<link>https:\/\/kesintimivar.com\/tr\/kesinti\/2026-08-26-girne-lapta-a3f19c2b<\/link>/);
  assert.match(rss, /<title>iptal edildi: Girne elektrik kesintisi — 26 Ağustos 2026<\/title>/);
  assert.match(rss, /<pubDate>Tue, 25 Aug 2026 14:00:00 GMT<\/pubDate>/);
  assert.equal(rss.split('<item>').length - 1, 2);
});
