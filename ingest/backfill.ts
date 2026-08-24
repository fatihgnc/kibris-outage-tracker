import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { Outage } from '../lib/types';
import { createServiceClient } from './supabase';
import { errorMessage, politeFetch, type ConditionalCache } from './http';
import { extractArticle } from './adapters/feed';
import { collectSitemapEntries } from './adapters/sitemap';
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
//   npm run backfill -- --per-source 20 --months 6 [--dry-run]

type ArchiveSource = {
  id: string;
  name: string;
  kind: 'official' | 'press';
  // Root sitemap. An index is followed one level down.
  sitemap: string;
  // How many sitemaps to follow from an index.
  maxSitemaps?: number;
  // Which sitemaps in an index are article sitemaps.
  sitemapMatch?: RegExp;
  // Where the newest chunk sits in the index.
  newest?: 'first' | 'last';
};

// Sitemaps rather than tag pages: none of these outlets surface outage
// articles through their RSS feed, and every one of them publishes a sitemap
// carrying <lastmod> (§10.8).
const SOURCES: ArchiveSource[] = [
  {
    id: 'detaykibris',
    name: 'Detay Kıbrıs',
    kind: 'press',
    sitemap: 'https://www.detaykibris.com/sitemap-news-01.xml',
  },
  {
    id: 'gundemkibris',
    name: 'Gündem Kıbrıs',
    kind: 'press',
    sitemap: 'https://www.gundemkibris.com/sitemap.xml',
    maxSitemaps: 8,
  },
  {
    id: 'kibrisgazetesi',
    name: 'Kıbrıs Gazetesi',
    kind: 'press',
    sitemap: 'https://kibrisgazetesi.com/sitemap_index.xml',
    sitemapMatch: /post-sitemap/i,
    newest: 'last',
    maxSitemaps: 3,
  },
  {
    id: 'yeniduzen',
    name: 'Yenidüzen',
    // sitemap.xsd is the index; its news chunks run oldest-first, so only the
    // last one is inside a six-month window.
    kind: 'press',
    sitemap: 'https://www.yeniduzen.com/sitemap.xsd',
    sitemapMatch: /sitemap-news-\d+/i,
    newest: 'last',
    maxSitemaps: 2,
  },
];

export async function backfill(options: { perSource?: number; dryRun?: boolean; since?: number } = {}) {
  const perSource = options.perSource ?? 60;
  const cache: ConditionalCache = new Map();
  const parsed: Outage[] = [];
  const review: ReviewItem[] = [];
  const seen = new Set<string>();

  for (const source of SOURCES) {
    const entries = await collectSitemapEntries(source.sitemap, cache, {
      maxSitemaps: source.maxSitemaps,
      sitemapMatch: source.sitemapMatch,
      newest: source.newest,
      since: options.since,
    });
    const capped = entries.slice(0, perSource);
    console.log(`[${source.id}] ${entries.length} candidate(s) in sitemap, taking ${capped.length}`);

    let kept = 0;
    let skipped = 0;
    for (const entry of capped) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);

      const article = await politeFetch(entry.url, cache);
      if (article.status !== 'ok') continue;
      const { title, body } = extractArticle(article.body);
      if (!looksLikeOutage(`${title} ${body}`)) {
        skipped++;
        continue;
      }

      const fetchedAt = new Date().toISOString();
      const outcome = parseAnnouncement({
        source: { name: source.name, url: entry.url, kind: source.kind },
        title,
        body,
        // The sitemap's own <lastmod> beats scraping the page for a date.
        publishedAt: entry.lastmod ?? publishedDate(article.body) ?? fetchedAt,
        fetchedAt,
      });

      if (outcome.status === 'parsed') {
        parsed.push(...outcome.records);
        kept++;
      } else if (outcome.status === 'failed') {
        review.push({
          source: { name: source.name, url: entry.url },
          rawText: `${title}
${body}`,
          reason: outcome.reason,
        });
      }
    }
    console.log(`[${source.id}] ${kept} parsed, ${skipped} not an outage, ${capped.length - kept - skipped} unparsed`);
  }

  const collapsed = dedupe(parsed);
  console.log(`backfill: ${parsed.length} record(s) -> ${collapsed.length} after dedupe, ${review.length} to review`);

  if (options.dryRun) {
    // A dry run exists to be read: print what was parsed so the rows can be
    // compared against the real announcements before any of it is stored.
    for (const record of collapsed) {
      const end = record.endsAt ? record.endsAt.slice(11, 16) : '??:??';
      console.log(
        `  ${record.kind.padEnd(8)} ${record.startsAt.slice(0, 16).replace('T', ' ')}-${end} ` +
          `${record.district.padEnd(11)} ${record.areas.join(', ')}`,
      );
      console.log(`           ${record.sources[0].url}`);
    }
    for (const item of review) {
      console.log(`  REVIEW  ${item.reason}  ${item.source.url}`);
    }
    return collapsed;
  }

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
  const perSourceArg = process.argv.indexOf('--per-source');
  const monthsArg = process.argv.indexOf('--months');
  const months = monthsArg === -1 ? 6 : Number(process.argv[monthsArg + 1]);
  backfill({
    perSource: perSourceArg === -1 ? undefined : Number(process.argv[perSourceArg + 1]),
    since: Date.now() - months * 30 * 86400000,
    dryRun: process.argv.includes('--dry-run'),
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(errorMessage(error));
      process.exit(1);
    });
}
