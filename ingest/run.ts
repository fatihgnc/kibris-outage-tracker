import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outage } from '../lib/types';
import { createServiceClient } from './supabase';
import { errorMessage, type ConditionalCache } from './http';
import { parseAnnouncement } from './parse';
import { runFallback } from './parse/fallback';
import { dedupe } from './dedupe';
import {
  queueForReview,
  retractOutages,
  storeOutages,
  type ReviewItem,
  type StoreResult,
} from './store';
import { logRun } from './log';
import { adapters as allAdapters } from './adapters';
import type { RawAnnouncement, SourceAdapter } from './adapters/types';

// Standalone Node script invoked by cron, never a Next.js route handler (§8).
// Runnable by hand: `npm run ingest`.

export type IngestOptions = {
  adapters?: SourceAdapter[];
  dryRun?: boolean;
  useFallback?: boolean;
  // A seam for the tests. The orchestration below decides what a run records
  // and when it gives up, and none of that is reachable while the only client
  // is the real one built from the environment.
  client?: SupabaseClient;
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
    for (const item of review) console.log(`  REVIEW  ${item.reason}  ${item.source.url}`);
    return { startedAt, records: collapsed, retractions, review, adaptersOk, adaptersFailed };
  }

  const client = options.client ?? createServiceClient();
  let stored: StoreResult = { created: 0, updated: 0, cancelled: 0 };
  let retracted = 0;
  let reviewCount = 0;
  let refreshed = false;
  let failure: unknown = null;

  // The run row is the only evidence that the ingest ran at all, and the status
  // bar reads the most recent ok one to decide whether to tell readers their
  // data is stale. Logging it after the writes meant a failure in any of them
  // lost the row entirely: a repeat in the review queue ended every run for two
  // days while outages were being stored the whole time, and the site went on
  // saying the sources could not be reached. Record the run whatever happened,
  // and re-raise afterwards so the job still fails and someone is told.
  try {
    stored = await storeOutages(client, collapsed);
    retracted = await retractOutages(client, retractions);
    // Past here what a reader sees is current, whatever else goes wrong.
    refreshed = true;
    reviewCount = await queueForReview(client, review);
  } catch (error) {
    failure = error;
    // Printed before logRun, so the cause survives even if logging the run
    // fails too and that error is the one that propagates.
    console.error(errorMessage(error));
  }

  const finishedAt = new Date().toISOString();
  // A run is ok when at least one adapter delivered and the outages reached the
  // database — only then is what a reader sees actually current. A failure in
  // the review queue leaves it true: that queue is the maintainer's work list,
  // and marking the data stale over it would tell readers something untrue.
  const ok = adaptersOk.length > 0 && refreshed;
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

  if (failure) throw failure;
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
