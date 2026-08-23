import type { SourceRef } from '../../lib/types';
import { politeFetch, type ConditionalCache } from '../http';
import { looksLikeOutage } from '../parse/kind';
import { extractArticle, extractArticleLinks, parseFeed } from './feed';
import type { RawAnnouncement, SourceAdapter } from './types';

export type OutletConfig = {
  id: string;
  // Display name shown in the card footer, in the outlet's own spelling.
  name: string;
  origin: string;
  // RSS/Atom feeds, tried in order.
  feeds?: string[];
  // Tag or category listing pages, for outlets whose feed omits outages.
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

      // Feeds first: they carry a publication date, which the parser needs to
      // resolve relative words like 'yarın'.
      for (const feedUrl of config.feeds ?? []) {
        const result = await politeFetch(feedUrl, cache);
        if (result.status !== 'ok') continue;

        for (const item of parseFeed(result.body)) {
          if (!item.link || seen.has(item.link)) continue;
          if (!looksLikeOutage(`${item.title} ${item.description}`)) continue;
          seen.add(item.link);
          if (announcements.length >= maxArticles) break;

          // Feed summaries are truncated, and the time range is often in the
          // part that was cut, so the article itself is fetched.
          const article = await politeFetch(item.link, cache);
          const extracted = article.status === 'ok' ? extractArticle(article.body) : null;
          const body =
            extracted && extracted.body.length > item.description.length ? extracted.body : item.description;

          announcements.push({
            source: source(item.link),
            title: item.title || extracted?.title || '',
            body,
            publishedAt: item.publishedAt ?? fetchedAt,
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
