import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { Outage } from '../lib/types';
import { createServiceClient } from './supabase';
import { errorMessage, politeFetch, type ConditionalCache } from './http';
import { extractArticle, extractArticleLinks } from './adapters/feed';
import { looksLikeOutage } from './parse/kind';
import { parseAnnouncement } from './parse';
import { dedupe } from './dedupe';
import { queueForReview, storeOutages, type ReviewItem } from './store';

// One-off historical walk (§10.8). Six months of history makes the archive and
// the twelve-month chart meaningful from launch instead of a year from now —
// and that archive is the thing nobody else has.
//
// Runs through the same parser as the live ingest, so a record backfilled
// today is indistinguishable from one ingested at the time.
//
//   npm run backfill -- --pages 20

type ArchiveSource = {
  id: string;
  name: string;
  kind: 'official' | 'press';
  // Page N of the outlet's outage tag archive.
  pageUrl: (page: number) => string;
  articlePattern: RegExp;
};

const SOURCES: ArchiveSource[] = [
  {
    id: 'kibtek',
    name: 'KIB-TEK',
    kind: 'official',
    pageUrl: (page) => `https://www.kibtek.com/category/acil-duyuru/page/${page}/`,
    articlePattern: /^\/[a-z0-9-]{10,}\/$/i,
  },
  {
    id: 'gundemkibris',
    name: 'Gündem Kıbrıs',
    kind: 'press',
    pageUrl: (page) => `https://www.gundemkibris.com/arama?q=elektrik+kesintisi&page=${page}`,
    articlePattern: /^\/[a-z0-9-]{10,}$/i,
  },
  {
    id: 'yeniduzen',
    name: 'Yenidüzen',
    kind: 'press',
    pageUrl: (page) => `https://www.yeniduzen.com/arama?kelime=elektrik%20kesintisi&sayfa=${page}`,
    articlePattern: /-\d+h?\.htm|\/[a-z0-9-]{10,}$/i,
  },
];

export async function backfill(options: { pages?: number; dryRun?: boolean } = {}) {
  const pages = options.pages ?? 10;
  const cache: ConditionalCache = new Map();
  const parsed: Outage[] = [];
  const review: ReviewItem[] = [];
  const seen = new Set<string>();

  for (const source of SOURCES) {
    for (let page = 1; page <= pages; page++) {
      const listing = await politeFetch(source.pageUrl(page), cache);
      if (listing.status !== 'ok') {
        console.log(`[${source.id}] page ${page}: ${listing.status === 'skipped' ? listing.reason : 'unchanged'}`);
        break;
      }

      const links = extractArticleLinks(listing.body, source.pageUrl(page), source.articlePattern).filter(
        (link) => !seen.has(link),
      );
      if (links.length === 0) {
        console.log(`[${source.id}] page ${page}: no further articles`);
        break;
      }

      let kept = 0;
      for (const link of links) {
        seen.add(link);
        const article = await politeFetch(link, cache);
        if (article.status !== 'ok') continue;
        const { title, body } = extractArticle(article.body);
        if (!looksLikeOutage(`${title} ${body}`)) continue;

        const fetchedAt = new Date().toISOString();
        const outcome = parseAnnouncement({
          source: { name: source.name, url: link, kind: source.kind },
          title,
          body,
          publishedAt: publishedDate(article.body) ?? fetchedAt,
          fetchedAt,
        });

        if (outcome.status === 'parsed') {
          parsed.push(...outcome.records);
          kept++;
        } else if (outcome.status === 'failed') {
          review.push({
            source: { name: source.name, url: link },
            rawText: `${title}\n${body}`,
            reason: outcome.reason,
          });
        }
      }
      console.log(`[${source.id}] page ${page}: ${links.length} article(s), ${kept} parsed`);
    }
  }

  const collapsed = dedupe(parsed);
  console.log(`backfill: ${parsed.length} record(s) -> ${collapsed.length} after dedupe, ${review.length} to review`);

  if (options.dryRun) return collapsed;

  const client = createServiceClient();
  const stored = await storeOutages(client, collapsed);
  const reviewed = await queueForReview(client, review);
  console.log(`backfill stored: ${stored.created} created, ${stored.updated} updated, ${reviewed} to review`);
  return collapsed;
}

function publishedDate(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;
    const parsed = Date.parse(match[1]);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('ingest/backfill.ts');

if (invokedDirectly) {
  const pagesArg = process.argv.indexOf('--pages');
  backfill({
    pages: pagesArg === -1 ? undefined : Number(process.argv[pagesArg + 1]),
    dryRun: process.argv.includes('--dry-run'),
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(errorMessage(error));
      process.exit(1);
    });
}
