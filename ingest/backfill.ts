import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { Outage } from '../lib/types';
import { createServiceClient } from './supabase';
import { errorMessage, politeFetch, type ConditionalCache } from './http';
import { extractArticle } from './adapters/feed';
// The same reader the live ingest uses. This file had its own narrower copy,
// which missed the microdata and Dublin Core forms and so fell back to the run
// time — the exact bug that dated a three-day-old announcement as today's.
import { articleDate } from './adapters/outlet';
import { collectSitemapEntries } from './adapters/sitemap';
import { looksLikeOutage } from './parse/kind';
import { parseAnnouncement, type Resolution } from './parse';
import { dedupe } from './dedupe';
import {
  queueForReview,
  resolveOpenOutages,
  retractOutages,
  storeOutages,
  type ReviewItem,
} from './store';

// One-off historical walk (§10.8). Six months of history makes the archive and
// the twelve-month chart meaningful from launch instead of a year from now —
// and that archive is the thing nobody else has.
//
// Runs through the same parser as the live ingest, and now through the same
// three writes: records are stored, retractions cancel what they name, and a
// repair report closes the fault it reports (§10.6). It used to do only the
// first, which left a historical announcement that called work off standing in
// the archive as work that happened, and every backfilled fault open with no
// end — and the twelve-month chart sums only records that have one, so the
// chart this script exists to fill was the thing missing them.
//
// What still differs from a run: no IndexNow ping, no ingest_runs row, and no
// conditional-request cache across invocations. None of those change a record.
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
  // An announcement that called work off, or reported a fault repaired, is as
  // much a part of the archive as one that announced an outage (§10.6) — and
  // this script's whole claim is that a record backfilled today is
  // indistinguishable from one ingested at the time. It used to collect neither.
  const retractions: Outage[] = [];
  const resolutions: Resolution[] = [];
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
    let called = 0;
    let repaired = 0;
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
      const outcome = await parseAnnouncement({
        source: { name: source.name, url: entry.url, kind: source.kind },
        title,
        body,
        // The sitemap's own <lastmod> beats scraping the page for a date.
        publishedAt: entry.lastmod ?? articleDate(article.body) ?? fetchedAt,
        fetchedAt,
      });

      if (outcome.status === 'parsed') {
        parsed.push(...outcome.records);
        retractions.push(...outcome.retractions);
        resolutions.push(...outcome.resolutions);
        kept++;
        called += outcome.retractions.length;
        repaired += outcome.resolutions.length;
      } else if (outcome.status === 'failed') {
        review.push({
          source: { name: source.name, url: entry.url },
          rawText: `${title}
${body}`,
          reason: outcome.reason,
        });
      }
    }
    console.log(
      `[${source.id}] ${kept} parsed, ${skipped} not an outage, ` +
        `${capped.length - kept - skipped} unparsed` +
        (called > 0 ? `, ${called} retraction(s)` : '') +
        (repaired > 0 ? `, ${repaired} repair report(s)` : ''),
    );
  }

  const collapsed = dedupe(parsed);
  console.log(
    `backfill: ${parsed.length} record(s) -> ${collapsed.length} after dedupe; ` +
      `${retractions.length} retraction(s); ${resolutions.length} repair report(s); ` +
      `${review.length} to review`,
  );

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
    for (const r of retractions) console.log(`  CANCELLED  ${r.district}  ${r.areas.join(', ')}`);
    for (const r of resolutions) console.log(`  REPAIRED  ${r.district}  ${r.areas.join(', ')}`);
    for (const item of review) {
      console.log(`  REVIEW  ${item.reason}  ${item.source.url}`);
    }
    return collapsed;
  }

  const client = createServiceClient();
  // The same order the live run uses, and for the same reason: everything is
  // stored first, so a fault announced and then repaired inside one backfill is
  // closed rather than missed, and a retraction reaches a row that exists.
  // Ordering by hand matters more here than in a run — six months of
  // announcements arrive in sitemap order, not in the order they happened.
  const stored = await storeOutages(client, collapsed);
  const retracted = await retractOutages(client, retractions);
  const closed = await resolveOpenOutages(client, resolutions);
  const reviewed = await queueForReview(client, review);
  console.log(
    `backfill stored: ${stored.created} created, ${stored.updated} updated, ` +
      `${stored.cancelled + retracted} retracted, ${closed} closed by a repair report, ` +
      `${reviewed} to review`,
  );
  return collapsed;
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
