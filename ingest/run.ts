import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outage } from '../lib/types';
import type { Resolution } from './parse';
import { createServiceClient } from './supabase';
import { errorMessage, type ConditionalCache } from './http';
import { parseAnnouncement } from './parse';
import { hasApiKey } from './parse/llm';
import { dedupe } from './dedupe';
import {
  markRead,
  queueForReview,
  resolveOpenOutages,
  retractOutages,
  selectUnread,
  storeOutages,
  type ReviewItem,
  type StoreResult,
} from './store';
import { logRun } from './log';
import { pingIndexNow } from './indexnow';
import { adapters as allAdapters } from './adapters';
import type { RawAnnouncement, SourceAdapter } from './adapters/types';

// Standalone Node script invoked by cron, never a Next.js route handler (§8).
// Runnable by hand: `npm run ingest`.

export type IngestOptions = {
  adapters?: SourceAdapter[];
  dryRun?: boolean;
  // A seam for the tests. The orchestration below decides what a run records
  // and when it gives up, and none of that is reachable while the only client
  // is the real one built from the environment.
  client?: SupabaseClient;
};

export async function ingest(options: IngestOptions = {}) {
  const adapters = options.adapters ?? allAdapters;
  const startedAt = new Date().toISOString();

  // Said once, loudly. Without a key nothing can be read at all and every
  // announcement lands in the review queue — a run that looks like it worked
  // and stored nothing.
  if (!hasApiKey()) {
    console.error('OPENAI_API_KEY is not set: nothing can be parsed, everything goes to review.');
  }
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
  const resolutions: Resolution[] = [];
  const review: ReviewItem[] = [];
  const read: { announcement: RawAnnouncement; parsedOk: boolean }[] = [];
  const skipped: RawAnnouncement[] = [];

  // Reading is now a paid request, so an article is read once. The adapters
  // look three days back and this runs every ten minutes, which means the same
  // article arrives hundreds of times; without this the bill is that number
  // times over for no new information. A dry run has no client to ask, and
  // reads whatever the adapters handed it.
  const readClient = options.dryRun ? null : (options.client ?? createServiceClient());
  const unread = readClient ? await selectUnread(readClient, announcements) : announcements;
  if (unread.length !== announcements.length) {
    console.log(`${announcements.length - unread.length} announcement(s) already read, skipping`);
  }

  // One announcement per request rather than a batch in one prompt: batching
  // lets a single malformed article spoil the reading of the others, and the
  // volume here is a couple per run.
  for (const announcement of unread) {
    const outcome = await parseAnnouncement(announcement);
    // 'skipped' is a real answer — the model read it and it is not an outage —
    // so it counts as read. Only a failure is worth another attempt.
    read.push({ announcement, parsedOk: outcome.status !== 'failed' });

    // A skip used to mean a keyword check said no. It now means the model read
    // the article and judged there was no outage in it, which is a decision
    // worth being able to see — a wrong one is invisible otherwise, and looks
    // exactly like a quiet day.
    if (outcome.status === 'skipped') {
      skipped.push(announcement);
      continue;
    }

    if (outcome.status === 'failed') {
      // Never dropped. The review queue is what makes one parser safe to depend
      // on: whatever the model does with an announcement, the raw text is kept
      // and a person can see what was lost.
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
    resolutions.push(...outcome.resolutions);
  }

  for (const announcement of skipped) {
    console.log(`[skipped] no outage found: ${announcement.source.url}`);
  }
  // The reason, not just the count. A run where everything failed and a run
  // where everything was read look identical in the summary line below, and the
  // reason is the whole diagnosis — a bad key, a rate limit and an article the
  // model could not use are three different problems with the same shape from
  // the outside. It is written to the review queue either way; this puts it
  // where whoever is watching the job can see it.
  for (const item of review) {
    console.warn(`[review] ${item.reason}: ${item.source.url}`);
  }

  const collapsed = dedupe(parsed);
  console.log(
    `read ${unread.length} announcement(s): ${parsed.length} record(s) -> ${collapsed.length} ` +
      `after dedupe; ${retractions.length} retraction(s); ${resolutions.length} repair report(s); ` +
      `${skipped.length} skipped; ${review.length} to review`,
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
    for (const r of resolutions) console.log(`  REPAIRED  ${r.district}  ${r.areas.join(', ')}`);
    for (const item of review) console.log(`  REVIEW  ${item.reason}  ${item.source.url}`);
    return { startedAt, records: collapsed, retractions, resolutions, review, adaptersOk, adaptersFailed };
  }

  const client = readClient ?? createServiceClient();
  let stored: StoreResult = { created: 0, updated: 0, cancelled: 0, written: [] };
  let retracted = 0;
  let closed = 0;
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
    // After the upserts, so a fault reported and repaired inside one run is
    // stored first and then closed, rather than closed before it exists.
    closed = await resolveOpenOutages(client, resolutions);
    // Past here what a reader sees is current, whatever else goes wrong.
    refreshed = true;
    reviewCount = await queueForReview(client, review);
    // Last, and only once the outcome of each article is settled. Recording an
    // article as read before its records are stored would lose it for good if
    // the write failed.
    await markRead(client, read);
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
      `${stored.cancelled + retracted} retracted, ${closed} closed by a repair report, ` +
      `${reviewCount} queued for review`,
  );

  // After logRun, and never in front of it: this run's evidence matters, a
  // search engine ping does not. pingIndexNow catches its own errors, so a
  // failure here cannot change whether the run is recorded or whether the job
  // passes — the archive is the product, being crawled promptly is a courtesy.
  if (refreshed) {
    const ping = await pingIndexNow(client, stored.written);
    console.log(
      ping.skipped
        ? `indexnow: skipped — ${ping.skipped}`
        : `indexnow: submitted ${ping.submitted} urls (${ping.status})`,
    );
  }

  if (failure) throw failure;
  return { startedAt, records: collapsed, retractions, resolutions, review, adaptersOk, adaptersFailed };
}

const isEntryPoint = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);

if (isEntryPoint) {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  ingest({
    adapters: only.length ? allAdapters.filter((adapter) => only.includes(adapter.id)) : undefined,
    dryRun,
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(errorMessage(error));
      process.exit(1);
    });
}
