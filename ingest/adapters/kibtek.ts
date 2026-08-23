import type { SourceRef } from '../../lib/types';
import { politeFetch, type ConditionalCache } from '../http';
import { looksLikeOutage } from '../parse/kind';
import { extractArticle, parseFeed } from './feed';
import type { RawAnnouncement, SourceAdapter } from './types';

// The utility's own announcements. Authoritative, sometimes slower than the
// outlets that republish it. The site is WordPress, so the REST API and the
// category feeds are the stable surface — no scraping of rendered pages.
const ORIGIN = 'https://www.kibtek.com';

// 'Planlı Kesintiler' and 'Acil Duyuru' are where outage notices land; the
// main feed also carries tenders, which looksLikeOutage() filters out.
const FEEDS = [
  `${ORIGIN}/category/planli-kesinti/feed/`,
  `${ORIGIN}/category/acil-duyuru/feed/`,
  `${ORIGIN}/feed/`,
];

function sourceRef(url: string): SourceRef {
  return { name: 'KIB-TEK', url, kind: 'official' };
}

export const kibtek: SourceAdapter = {
  id: 'kibtek',
  async fetch(cache: ConditionalCache): Promise<RawAnnouncement[]> {
    const fetchedAt = new Date().toISOString();
    const announcements: RawAnnouncement[] = [];
    const seen = new Set<string>();

    for (const feedUrl of FEEDS) {
      const result = await politeFetch(feedUrl, cache);
      if (result.status !== 'ok') continue;

      for (const item of parseFeed(result.body)) {
        if (!item.link || seen.has(item.link)) continue;
        if (!looksLikeOutage(`${item.title} ${item.description}`)) continue;
        seen.add(item.link);

        // The summary is often truncated mid-sentence, and the time range can
        // be in the part that was cut. Fetch the post for the full text.
        let body = item.description;
        const article = await politeFetch(item.link, cache);
        if (article.status === 'ok') {
          const extracted = extractArticle(article.body);
          if (extracted.body.length > body.length) body = extracted.body;
        }

        announcements.push({
          source: sourceRef(item.link),
          title: item.title,
          body,
          publishedAt: item.publishedAt ?? fetchedAt,
          fetchedAt,
        });
      }
    }

    return announcements;
  },
};
