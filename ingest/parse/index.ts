import type { Outage, SourceRef } from '../../lib/types';
import { fingerprint } from '../fingerprint';
import { parseSchedule } from './datetime';
import { classifyKind, isCancellation, isResolved, looksLikeOutage } from './kind';
import { districtsOf, matchPlaces, type PlaceMatch } from './places';
import { collapseWhitespace } from './text';

export type RawAnnouncement = {
  source: SourceRef;
  title: string;
  body: string;
  publishedAt: string; // ISO 8601
  fetchedAt: string; // ISO 8601
};

export type ParseOutcome =
  | { status: 'parsed'; records: Outage[]; cancellation: boolean; fuzzyPlaces: PlaceMatch[] }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string; text: string };

// Stage 1 — rules. Handles the large majority of announcements; anything it
// cannot fully parse falls through to the LLM fallback (§10.4) and then to the
// review queue. Pure: no network, no clock reads beyond the passed values.
export function parseAnnouncement(
  announcement: RawAnnouncement,
  options: { confidence?: 'high' | 'low' } = {},
): ParseOutcome {
  const text = collapseWhitespace(`${announcement.title}. ${announcement.body}`);

  if (!looksLikeOutage(text)) {
    return { status: 'skipped', reason: 'not an outage announcement' };
  }

  const kind = classifyKind(text);

  // A fault in progress does not come with hours, and demanding them threw the
  // whole announcement away. "Bir iş aracının orta gerilim hatlarına çarpması
  // sonucu ... elektrik verilemiyor" names the villages and the cause and says
  // it is happening now; there is no window to quote because nobody knows when
  // the power comes back. That is exactly the record `endsAt: null` exists for
  // — see lib/types.ts, "null = end time unknown, typical for faults" — and
  // Stage 1 could not produce one. 78 of the first 82 records were planned
  // outages for this reason, not because faults are rare.
  //
  // The announcement's own publication time stands in for the start. It is an
  // approximation, and the only one made here: a fault is reported once it is
  // already being felt, so it is late rather than early, which is the safer
  // direction — the map does not claim an outage before anyone had one.
  //
  // Planned work keeps its hard requirement. It always states its hours, so a
  // missing range there means the parse went wrong, and inventing a start would
  // put a made-up window on a card.
  let schedule = parseSchedule(text, announcement.publishedAt);
  if (!schedule && kind === 'fault' && !isResolved(text)) {
    schedule = { startsAt: announcement.publishedAt, endsAt: null };
  }
  if (!schedule) {
    return { status: 'failed', reason: 'no time range found', text };
  }

  const places = matchPlaces(text);
  if (places.length === 0) {
    return { status: 'failed', reason: 'no known place names found', text };
  }

  const cancellation = isCancellation(text);
  const confidence = options.confidence ?? 'high';

  // An announcement spanning districts becomes one record per district, so a
  // reader filtering by district still sees their own (§10.4).
  const records = districtsOf(places).map((district) => {
    const areas = places.filter((place) => place.district === district).map((place) => place.name);
    return {
      id: fingerprint({ startsAt: schedule.startsAt, endsAt: schedule.endsAt, areas }),
      utility: 'electricity',
      kind,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      district,
      areas,
      sources: [announcement.source],
      publishedAt: announcement.publishedAt,
      ingestedAt: announcement.fetchedAt,
      confidence,
    } satisfies Outage;
  });

  return {
    status: 'parsed',
    records,
    cancellation,
    fuzzyPlaces: places.filter((place) => place.fuzzy),
  };
}
