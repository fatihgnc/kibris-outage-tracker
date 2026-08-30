// Reading a stored record's sources back through today's parser.
//
// Two scripts need this and they must not drift apart: `audit-records.ts` asks
// whether a source still supports the record it produced, and
// `backfill-scope.ts` asks what a field on that record would be if it were
// parsed today. Both questions are "what does today's parser make of this
// article", and two copies of the answer is how they start disagreeing about
// it — the same reasoning `lib/db.ts` gives for keeping `OUTAGE_COLUMNS` in one
// place.
//
// Every call is a fetch and a paid model read, so the reriver memoises by URL:
// one article read once, however many records name it.

import type { Outage, SourceRef } from '../lib/types';
import { politeFetch, type ConditionalCache } from '../ingest/http';
import { articleDate } from '../ingest/adapters/outlet';
import { extractArticle } from '../ingest/adapters/feed';
import { parseAnnouncement } from '../ingest/parse';

/**
 * What a source says today: the records today's parser derives from it, and the
 * publication date the page carries now.
 *
 * The date is what separates a record an edit has overtaken from one that was
 * simply wrong. Outlets rewrite these announcements in place — moving a lead
 * from 'yarın' to 'bugün' on the morning of the work — and republish under a
 * new slug the old URL redirects to, so a page published after we read it is no
 * evidence at all about the record we parsed from the earlier text.
 */
export type Rederived = { records: Outage[]; publishedAt: string };

/**
 * `null` means the announcement could not be re-derived at all: a dead link, a
 * block, or text today's parser rejects. That is not evidence against a record
 * either — callers report it apart from a real disagreement.
 */
export function createRederiver(): (source: SourceRef) => Promise<Rederived | null> {
  const cache: ConditionalCache = new Map();
  const seen = new Map<string, Rederived | null>();

  return async function rederive(source: SourceRef): Promise<Rederived | null> {
    const hit = seen.get(source.url);
    if (hit !== undefined) return hit;

    let result: Rederived | null = null;
    const article = await politeFetch(source.url, cache);
    if (article.status === 'ok') {
      const { title, body } = extractArticle(article.body);
      const publishedAt = articleDate(article.body);
      if (publishedAt) {
        const outcome = await parseAnnouncement({
          source,
          title,
          body,
          publishedAt,
          // The page's own date on both: a re-read has no separate moment of
          // fetching to record, and `ingestedAt` is not what is being asked.
          fetchedAt: publishedAt,
        });
        if (outcome.status === 'parsed') result = { publishedAt, records: outcome.records };
      }
    }
    seen.set(source.url, result);
    return result;
  };
}
