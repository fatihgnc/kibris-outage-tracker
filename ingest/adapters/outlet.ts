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

// Publication date from the page's own metadata, which every one of these
// sites emits in at least one of these forms.
function articleDate(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;
    const parsed = Date.parse(match[1]);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}
