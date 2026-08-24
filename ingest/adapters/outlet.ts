import type { SourceRef } from '../../lib/types';
import { politeFetch, type ConditionalCache } from '../http';
import { looksLikeOutage } from '../parse/kind';
import { extractArticle, extractArticleLinks } from './feed';
import { collectSitemapEntries, OUTAGE_SLUG } from './sitemap';
import type { RawAnnouncement, SourceAdapter } from './types';

export type OutletConfig = {
  id: string;
  // Display name shown in the card footer, in the outlet's own spelling.
  name: string;
  origin: string;
  // Sitemaps, tried in order. Preferred where the outlet publishes a compact
  // news sitemap: it is machine-readable and carries <lastmod>.
  sitemaps?: string[];
  // How far back a run looks. Anything older was seen by an earlier run.
  sinceDays?: number;
  // Listing pages, for outlets with no compact sitemap. The homepage works:
  // it is the page everyone already loads, and it is far smaller than a full
  // archive sitemap.
  listings?: string[];
  // Which paths on a listing page are articles.
  articlePattern?: RegExp;
  // Cap on article fetches per run, so one adapter cannot dominate the run.
  maxArticles?: number;
};

const DEFAULT_MAX_ARTICLES = 12;

// Every outlet is a news site: an RSS feed plus article pages, or a tag page
// plus article pages. Only structured facts are extracted downstream; the
// article text is never stored or republished (§10.3).
export function createOutletAdapter(config: OutletConfig): SourceAdapter {
  const source = (url: string): SourceRef => ({ name: config.name, url, kind: 'press' });
  const maxArticles = config.maxArticles ?? DEFAULT_MAX_ARTICLES;

  return {
    id: config.id,
    async fetch(cache: ConditionalCache): Promise<RawAnnouncement[]> {
      const fetchedAt = new Date().toISOString();
      const announcements: RawAnnouncement[] = [];
      const seen = new Set<string>();

      // Sitemaps first: they name the article in the URL, so most of the
      // archive is filtered out before anything is downloaded, and each entry
      // carries <lastmod> — the publication date the parser needs to resolve
      // relative words like 'yarın' (§10.4).
      //
      // The outlets' RSS feeds are deliberately not used: every one of them
      // was checked against live data and none carried a single outage
      // article. They are short rolling windows of headline news.
      const since = Date.now() - (config.sinceDays ?? 3) * 86400000;
      for (const sitemapUrl of config.sitemaps ?? []) {
        if (announcements.length >= maxArticles) break;
        const entries = await collectSitemapEntries(sitemapUrl, cache, { since });

        for (const entry of entries) {
          if (seen.has(entry.url) || announcements.length >= maxArticles) continue;
          seen.add(entry.url);

          const article = await politeFetch(entry.url, cache);
          if (article.status !== 'ok') continue;
          const extracted = extractArticle(article.body);
          if (!looksLikeOutage(`${extracted.title} ${extracted.body}`)) continue;

          announcements.push({
            source: source(entry.url),
            title: extracted.title,
            body: extracted.body,
            publishedAt: entry.lastmod ?? articleDate(article.body) ?? fetchedAt,
            fetchedAt,
          });
        }
      }

      const pattern = config.articlePattern ?? /\/[a-z0-9-]{8,}$/i;
      for (const listingUrl of config.listings ?? []) {
        if (announcements.length >= maxArticles) break;
        const listing = await politeFetch(listingUrl, cache);
        if (listing.status !== 'ok') continue;

        for (const link of extractArticleLinks(listing.body, listingUrl, pattern)) {
          if (seen.has(link) || announcements.length >= maxArticles) continue;
          // The slug names the subject, so it filters the listing before
          // anything is downloaded. Without this a run pulls a dozen unrelated
          // articles off the homepage and discards them after the fetch.
          if (!OUTAGE_SLUG.test(link)) continue;
          seen.add(link);

          const article = await politeFetch(link, cache);
          if (article.status !== 'ok') continue;
          const extracted = extractArticle(article.body);
          if (!looksLikeOutage(`${extracted.title} ${extracted.body}`)) continue;

          announcements.push({
            source: source(link),
            title: extracted.title,
            // No publication date on a listing page; the fetch time is the
            // best available anchor for relative date words.
            body: extracted.body,
            publishedAt: articleDate(article.body) ?? fetchedAt,
            fetchedAt,
          });
        }
      }

      return announcements;
    },
  };
}

// Publication date from the page's own metadata. Every one of these sites
// emits it, but not in the same shape: a <meta> tag, a microdata `itemprop` on
// an arbitrary element, or a JSON-LD block. Attribute order varies too, so the
// key and the value are read independently of where they sit in the tag.
// Getting this wrong is not a small miss: without a date the fetch time stands
// in, and a body that says 'bugün' then resolves to the day of the run, so a
// three-day-old announcement is republished as today's outage (§10.4).
const DATE_KEYS = [
  'article:published_time',
  'datepublished',
  'pubdate',
  'dc.date.issued',
  'datecreated',
  'date',
];

export function articleDate(html: string): string | null {
  const found = new Map<string, string>();

  for (const tag of html.matchAll(/<[a-z][^>]*\bcontent=[^>]*>/gi)) {
    const key = /\b(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag[0]);
    const content = /\bcontent=["']([^"']+)["']/i.exec(tag[0]);
    if (!key || !content) continue;
    const normalised = key[1].trim().toLowerCase();
    if (!found.has(normalised)) found.set(normalised, content[1]);
  }

  const jsonLd = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html);
  if (jsonLd && !found.has('datepublished')) found.set('datepublished', jsonLd[1]);

  const time = /<time[^>]+datetime=["']([^"']+)["']/i.exec(html);
  if (time) found.set('time', time[1]);

  for (const key of [...DATE_KEYS, 'time']) {
    const value = found.get(key);
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}
