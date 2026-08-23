import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { Outage } from '../lib/types';
import { createServiceClient } from './supabase';
import { errorMessage, type ConditionalCache } from './http';
import { parseAnnouncement } from './parse';
import { runFallback } from './parse/fallback';
import { dedupe } from './dedupe';
import { queueForReview, retractOutages, storeOutages, type ReviewItem } from './store';
import { logRun } from './log';
import { adapters as allAdapters } from './adapters';
import type { RawAnnouncement, SourceAdapter } from './adapters/types';

// Standalone Node script invoked by cron, never a Next.js route handler (§8).
// Runnable by hand: `npm run ingest`.

export type IngestOptions = {
  adapters?: SourceAdapter[];
  dryRun?: boolean;
  useFallback?: boolean;
};

export async function ingest(options: IngestOptions = {}) {
  const adapters = options.adapters ?? allAdapters;
  const startedAt = new Date().toISOString();
  const cache: ConditionalCache = new Map();

  const announcements: RawAnnouncement[] = [];
  const adaptersOk: string[] = [];
  const adaptersFailed: string[] = [];

  // One failing adapter must never stop the run: each is wrapped, the failure
  // logged with its id, and the rest continue. A partial run is a success
  // (§10.2).
  for (const adapter of adapters) {
    try {
      const fetched = await adapter.fetch(cache);
      announcements.push(...fetched);
      adaptersOk.push(adapter.id);
      console.log(`[${adapter.id}] ${fetched.length} announcement(s)`);
    } catch (error) {
      adaptersFailed.push(adapter.id);
      console.error(`[${adapter.id}] failed: ${errorMessage(error)}`);
    }
  }

  const parsed: Outage[] = [];
  const retractions: Outage[] = [];
  const review: ReviewItem[] = [];

  for (const announcement of announcements) {
    const outcome = parseAnnouncement(announcement);

    if (outcome.status === 'skipped') continue;

    if (outcome.status === 'failed') {
      // Stage 2 — the fallback exists to catch the tail, not to do the work.
      const fallback = options.useFallback === false ? null : await runFallback(announcement);
      if (fallback) {
        (fallback.cancellation ? retractions : parsed).push(...fallback.records);
        continue;
      }
      review.push({
        source: { name: announcement.source.name, url: announcement.source.url },
        rawText: `${announcement.title}\n${announcement.body}`,
        reason: outcome.reason,
      });
      continue;
    }

    for (const place of outcome.fuzzyPlaces) {
      console.warn(`[fuzzy] "${place.matchedText}" matched ${place.name} (${announcement.source.url})`);
    }
    (outcome.cancellation ? retractions : parsed).push(...outcome.records);
  }

  const collapsed = dedupe(parsed);
  console.log(
    `parsed ${parsed.length} record(s) -> ${collapsed.length} after dedupe; ` +
      `${retractions.length} retraction(s); ${review.length} to review`,
  );

  if (options.dryRun) {
    return { startedAt, records: collapsed, retractions, review, adaptersOk, adaptersFailed };
  }

  const client = createServiceClient();
  const stored = await storeOutages(client, collapsed);
  const retracted = await retractOutages(client, retractions);
  const reviewCount = await queueForReview(client, review);

  const finishedAt = new Date().toISOString();
  // A run is ok when at least one adapter delivered; only a total failure is
  // an outage of its own.
  const ok = adaptersOk.length > 0;
  await logRun(client, {
    startedAt,
    finishedAt,
    ok,
    adaptersOk,
    adaptersFailed,
    createdCount: stored.created,
    updatedCount: stored.updated,
    reviewCount,
  });

  console.log(
    `stored: ${stored.created} created, ${stored.updated} updated, ` +
      `${stored.cancelled + retracted} retracted, ${reviewCount} queued for review`,
  );
  return { startedAt, records: collapsed, retractions, review, adaptersOk, adaptersFailed };
}

const isEntryPoint = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);

if (isEntryPoint) {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  const noFallback = process.argv.includes('--no-fallback');
  ingest({
    adapters: only.length ? allAdapters.filter((adapter) => only.includes(adapter.id)) : undefined,
    dryRun,
    useFallback: !noFallback,
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(errorMessage(error));
      process.exit(1);
    });
}
