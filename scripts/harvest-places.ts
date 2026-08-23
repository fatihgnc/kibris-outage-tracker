// Maintenance tool for data/places.json, which caps parsing quality (§10.4).
//
// Scans real outage announcements for capitalised tokens the place matcher
// does not recognise and ranks them by how often they appear, so the list is
// grown from what announcements actually say rather than from a guess at what
// might be missing. Names still need a district checked by hand before they
// are added — the categories are not reliable on that.
//
//   node --import tsx scripts/harvest-places.ts

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { politeFetch, type ConditionalCache } from '../ingest/http';
import { extractArticle } from '../ingest/adapters/feed';
import { collectSitemapEntries } from '../ingest/adapters/sitemap';
import { looksLikeOutage } from '../ingest/parse/kind';
import { matchPlaces } from '../ingest/parse/places';

const SITEMAPS = [
  { url: 'https://www.detaykibris.com/sitemap-news-01.xml', o: {} },
  { url: 'https://www.gundemkibris.com/sitemap.xml', o: { maxSitemaps: 8 } },
  { url: 'https://kibrisgazetesi.com/sitemap_index.xml', o: { sitemapMatch: /post-sitemap/i, newest: 'last' as const, maxSitemaps: 3 } },
  { url: 'https://www.yeniduzen.com/sitemap.xsd', o: { sitemapMatch: /sitemap-news-\d+/i, newest: 'last' as const, maxSitemaps: 2 } },
];

// Tokens that look like a Turkish place name in an announcement's place list.
// The boundaries are Unicode lookarounds, not \b. JavaScript's \b is defined
// on ASCII word characters, so c-cedilla, s-cedilla, dotless-i and friends do
// not count as letters to it — which silently truncated every name ending in
// one. "Karaagac" came out as "Karaaga", never matched the place list, and so
// reappeared as unknown on every run no matter how often it had been added.
const CANDIDATE = /(?<!\p{L})([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}(?:\s(?:köyü|Köyü|Bölgesi|bölgesi))?)(?!\p{L})/gu;
const STOP = new Set([
  'Kıbrıs','Türk','Elektrik','Kurumu','Bugün','Yarın','Ayrıca','Ancak','Bunun','Saat','Saatleri',
  'Sokak','Sokağı','Caddesi','Bölge','Bölgesi','Bölgesinde','Merkezi','Trafo','Orta','Gerilim',
  'Proje','Bakım','Onarım','Çalışma','Çalışması','Arıza','Kesinti','Kesintisi','Enerji','Konu',
  'Buna','Nedeniyle','Şöyle','Açıklandı','Duyurdu','Ekim','Kasım','Aralık','Ocak','Şubat','Mart',
  'Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Pazartesi','Salı','Çarşamba','Perşembe',
  'Cuma','Cumartesi','Pazar','Lisesi','Okulu','Ortaokulu','İlkokulu','Hastahane','Hastane','Sanayi',
  'Sitesi','Mahallesi','Yolu','Civarı','Bir','Bazı','Tüm','Ile','Ve','Için','Gibi','Daha','Sonra',
]);

async function main() {
  const cache: ConditionalCache = new Map();
  const since = Date.now() - 9 * 30 * 86400000;
  const counts = new Map<string, number>();
  let scanned = 0;

  for (const s of SITEMAPS) {
    const entries = await collectSitemapEntries(s.url, cache, { ...s.o, since });
    for (const entry of entries.slice(0, 40)) {
      const article = await politeFetch(entry.url, cache);
      if (article.status !== 'ok') continue;
      const { title, body } = extractArticle(article.body);
      if (!looksLikeOutage(`${title} ${body}`)) continue;
      scanned++;
      const known = new Set(matchPlaces(body).map((m) => m.name));
      for (const m of body.matchAll(CANDIDATE)) {
        const token = m[1].replace(/\s+(köyü|Köyü|bölgesi|Bölgesi)$/i, '').trim();
        if (token.length < 4 || STOP.has(token)) continue;
        if (known.has(token)) continue;
        if (matchPlaces(token).length > 0) continue;
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }

  const ranked = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  console.log(`scanned ${scanned} outage article(s); ${ranked.length} unknown name(s) seen twice or more\n`);
  for (const [name, n] of ranked.slice(0, 200)) console.log(`${String(n).padStart(3)}  ${name}`);
}
main();
