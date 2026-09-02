import type { ArchivedOutage, DistrictId, Outage } from './types';
import { DISTRICTS } from './districts';
import { tr } from './i18n/tr';
import { defaultLocale } from './i18n/config';
import { formatDateLong, formatTimeRange } from './time';
import { outageSlug } from './slug';
import { routeHref } from './routes';

/**
 * A district's outages as a calendar and as a feed.
 *
 * "How do I follow my own district" has had one answer — bookmark the page —
 * and these are the two others that cost nothing to run: a calendar
 * subscription puts announced work on the phone's own calendar, and a feed
 * lets a newsroom or a village office watch a district without visiting.
 * Both are plain text built from the same records the pages show; nothing
 * here reads the database.
 *
 * Turkish throughout, like the manifest: a feed has no request to read a
 * locale from, and its readers are the site's readers.
 */

/** The address a feed lives at. Outside the locale tree, and dotted, so proxy.ts leaves it alone. */
export function feedPath(district: DistrictId, kind: 'calendar' | 'rss'): string {
  return `/feed/${district}/${kind === 'calendar' ? 'calendar.ics' : 'rss.xml'}`;
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are escaped in text.
const icsText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 §3.1: lines are at most 75 octets, folded with CRLF + one space.
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  let limit = 75;
  while (Buffer.byteLength(rest, 'utf8') > limit) {
    let cut = limit;
    // Never split a multi-byte character.
    while (cut > 0 && Buffer.byteLength(rest.slice(0, cut), 'utf8') > limit) cut--;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    limit = 74;
  }
  parts.push(rest);
  return parts.join('\r\n ');
}

const outageUrl = (outage: Pick<Outage, 'id' | 'startsAt' | 'district' | 'areas'>, site: URL) => {
  const slug = outageSlug(outage);
  return slug ? new URL(routeHref(defaultLocale, 'outage', slug), site).toString() : null;
};

/**
 * Announced work as calendar events. Faults are left out: a calendar is a
 * schedule, and a fault has none — its start is when it was noticed and its
 * end is usually unknown. Cancelled work is left out too; a cancelled event
 * on a calendar reads as a plan.
 */
export function buildIcs(district: DistrictId, records: readonly ArchivedOutage[], site: URL): string {
  const name = DISTRICTS[district].name;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${tr.brand}//${name}//TR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(tr.meta.districtTitle(name))}`,
    'X-WR-TIMEZONE:Asia/Nicosia',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const record of records) {
    if (record.kind === 'fault' || record.cancelled || !record.endsAt) continue;
    const url = outageUrl(record, site);
    const areas = record.scope === 'district' ? tr.card.districtWide : record.areas.join(', ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${record.id}@${site.host}`,
      `DTSTAMP:${stamp(record.ingestedAt)}`,
      `DTSTART:${stamp(record.startsAt)}`,
      `DTEND:${stamp(record.endsAt)}`,
      `SUMMARY:${icsText(`${tr.kind[record.kind]} · ${name} — ${areas}`)}`,
      `DESCRIPTION:${icsText(`${tr.footer.disclaimer}\n${record.sources[0].name}: ${record.sources[0].url}`)}`,
      ...(url ? [`URL:${url}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every record in the district, newest first, one item each. */
export function buildRss(district: DistrictId, records: readonly ArchivedOutage[], site: URL): string {
  const name = DISTRICTS[district].name;
  const page = new URL(routeHref(defaultLocale, 'district', district), site).toString();
  const items = records.map((record) => {
    const url = outageUrl(record, site) ?? page;
    const title = `${record.cancelled ? `${tr.card.cancelled}: ` : ''}${tr.meta.outageTitle(
      name,
      formatDateLong(record.startsAt, defaultLocale),
    )}`;
    const areas = record.scope === 'district' ? tr.card.districtWide : record.areas.join(', ');
    const description = `${tr.kind[record.kind]} · ${formatTimeRange(record, defaultLocale, tr)} · ${areas} · ${
      record.sources[0].name
    }`;
    return [
      '    <item>',
      `      <title>${xml(title)}</title>`,
      `      <link>${xml(url)}</link>`,
      `      <guid isPermaLink="true">${xml(url)}</guid>`,
      `      <pubDate>${new Date(record.publishedAt).toUTCString()}</pubDate>`,
      `      <description>${xml(description)}</description>`,
      '    </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xml(tr.meta.districtTitle(name))}</title>`,
    `    <link>${xml(page)}</link>`,
    `    <atom:link href="${xml(new URL(feedPath(district, 'rss'), site).toString())}" rel="self" type="application/rss+xml" />`,
    `    <description>${xml(tr.meta.districtDescription(name))}</description>`,
    '    <language>tr</language>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
