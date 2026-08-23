import { politeFetch, type ConditionalCache } from '../http';

// Sitemaps, not feeds, are how these outlets expose outage announcements.
// Every one of the five publishes a sitemap; none of their RSS feeds carry a
// single outage article — the feeds are short rolling windows of headline
// news. A sitemap also carries <lastmod>, which the parser needs to resolve
// relative words like 'yarın' against the announcement's own date (§10.4).

export type SitemapEntry = { url: string; lastmod: string | null };

const LOC = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
const URL_BLOCK = /<url>([\s\S]*?)<\/url>/gi;
const LASTMOD = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/i;

// A sitemap index points at other sitemaps rather than at pages.
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

export function parseSitemapIndex(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(LOC)) urls.push(decodeEntities(match[1]));
  return urls;
}

export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const block of xml.matchAll(URL_BLOCK)) {
    const inner = block[1];
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/i.exec(inner);
    if (!loc) continue;
    const lastmod = LASTMOD.exec(inner);
    entries.push({
      url: decodeEntities(loc[1]),
      lastmod: lastmod ? normaliseDate(lastmod[1]) : null,
    });
  }
  // Some sitemaps omit the <url> wrapper formatting we expect; fall back to
  // bare <loc> scanning rather than returning nothing.
  if (entries.length === 0) {
    for (const match of xml.matchAll(LOC)) entries.push({ url: decodeEntities(match[1]), lastmod: null });
  }
  return entries;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normaliseDate(value: string): string | null {
  const parsed = Date.parse(value.trim());
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// Slugs name their subject, so the URL alone filters most of the archive
// cheaply. Deliberately loose: the real filter is the parser, which requires
// both a time range and place names that match data/places.json — so a story
// about an outage in Hawaii or south of the line drops out on its own.
export const OUTAGE_SLUG = /elektrik|elektriksiz|enerji-veril/i;

export async function collectSitemapEntries(
  rootUrl: string,
  cache: ConditionalCache,
  options: { match?: RegExp; maxSitemaps?: number; since?: number } = {},
): Promise<SitemapEntry[]> {
  const match = options.match ?? OUTAGE_SLUG;
  const maxSitemaps = options.maxSitemaps ?? 8;

  const root = await politeFetch(rootUrl, cache);
  if (root.status !== 'ok') return [];

  const sitemaps = isSitemapIndex(root.body) ? parseSitemapIndex(root.body).slice(0, maxSitemaps) : [rootUrl];
  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();

  for (const sitemapUrl of sitemaps) {
    const xml =
      sitemapUrl === rootUrl ? root.body : await politeFetch(sitemapUrl, cache).then((r) => (r.status === 'ok' ? r.body : ''));
    if (!xml) continue;

    for (const entry of parseSitemap(xml)) {
      if (seen.has(entry.url)) continue;
      if (!match.test(entry.url)) continue;
      if (options.since && entry.lastmod && Date.parse(entry.lastmod) < options.since) continue;
      seen.add(entry.url);
      entries.push(entry);
    }
  }

  // Newest first, so a capped run takes the most recent announcements.
  return entries.sort((a, b) => Date.parse(b.lastmod ?? '0') - Date.parse(a.lastmod ?? '0'));
}
