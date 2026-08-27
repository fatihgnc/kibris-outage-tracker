import type { Outage, SourceRef } from '../../lib/types';
import { nicosiaWallClock, zonedTimeToUtc } from '../../lib/time';
import { fingerprint } from '../fingerprint';
import { extractOutages, WEEKDAYS, type ExtractedOutage, type Weekday } from './llm';
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

/**
 * Turns one announcement into records.
 *
 * The reading is done by the model (see ./llm.ts). Everything after it is ours,
 * and deliberately so — these are the parts where being wrong is expensive and
 * being deterministic is cheap:
 *
 * - **Places.** The model returns the names the announcement used; `matchPlaces`
 *   resolves them against `data/places.json`. The district is therefore derived
 *   from our own table and never from something the model asserted, and `areas`
 *   always holds canonical spellings — which is what lets a lamp on the map
 *   match a record at all (§3.2).
 * - **Time zones.** The model returns a local date and a wall clock; the
 *   conversion to UTC goes through `zonedTimeToUtc`, the same function the site
 *   reads back with.
 * - **Identity.** The fingerprint, so re-running is idempotent whatever the
 *   model returns.
 */
export async function parseAnnouncement(
  announcement: RawAnnouncement,
  fetchImpl?: typeof fetch,
): Promise<ParseOutcome> {
  const text = collapseWhitespace(`${announcement.title}. ${announcement.body}`);

  const extraction = await extractOutages(announcement, fetchImpl);
  if (extraction.status === 'error') {
    return { status: 'failed', reason: extraction.reason, text };
  }
  if (extraction.outages.length === 0) {
    return { status: 'skipped', reason: 'no outage in this article' };
  }

  const records: Outage[] = [];
  const fuzzyPlaces: PlaceMatch[] = [];
  let cancellation = false;
  let unresolved = 0;

  for (const outage of extraction.outages) {
    const schedule = toSchedule(outage, announcement.publishedAt);
    if (!schedule) {
      unresolved++;
      continue;
    }

    // The model is asked for the announcement's own spellings, not for ours.
    // Anything it invents or mangles simply fails to match here and is left out
    // rather than reaching the database as a place that does not exist.
    const places = matchPlaces(outage.areas.join(', '));
    if (places.length === 0) {
      unresolved++;
      continue;
    }
    fuzzyPlaces.push(...places.filter((place) => place.fuzzy));
    if (outage.cancelled) cancellation = true;

    // An announcement spanning districts becomes one record per district, so a
    // reader filtering by district still sees their own (§10.4).
    for (const district of districtsOf(places)) {
      const areas = places.filter((place) => place.district === district).map((place) => place.name);
      records.push({
        id: fingerprint({ startsAt: schedule.startsAt, endsAt: schedule.endsAt, areas }),
        utility: 'electricity',
        kind: outage.kind,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        district,
        areas,
        sources: [announcement.source],
        publishedAt: announcement.publishedAt,
        ingestedAt: announcement.fetchedAt,
        confidence: schedule.inferredStart ? 'low' : 'high',
      });
    }
  }

  if (records.length === 0) {
    return {
      status: 'failed',
      reason: unresolved > 0 ? 'no known place names found' : 'nothing usable in the extraction',
      text,
    };
  }
  return { status: 'parsed', records, cancellation, fuzzyPlaces };
}

type Schedule = { startsAt: string; endsAt: string | null; inferredStart: boolean };

function toSchedule(outage: ExtractedOutage, publishedAt: string): Schedule | null {
  // A fault already under way has no announced start, and the announcement's
  // own publication time stands in for one. It is the only value here that is
  // not read off the page, and it errs late rather than early: a fault is
  // reported once it is already being felt, so the map never claims an outage
  // before anyone had one. The record is marked 'low' confidence for it.
  //
  // Without a start and without being ongoing there is nothing to place on a
  // timeline, and the announcement goes to review instead.
  if (outage.start === null) {
    if (!outage.ongoing || outage.kind !== 'fault') return null;
    return { startsAt: publishedAt, endsAt: null, inferredStart: true };
  }

  const date = outage.weekday ? dateOfNext(outage.weekday, publishedAt) : outage.date;
  const startsAt = toIso(date, outage.start);
  if (!startsAt) return null;
  let endsAt = outage.end ? toIso(date, outage.end) : null;
  // An outage announced as 22:00–02:00 ends the next day.
  if (endsAt && endsAt <= startsAt) endsAt = new Date(Date.parse(endsAt) + 86400000).toISOString();
  return { startsAt, endsAt, inferredStart: false };
}

/**
 * The date of the next given weekday, on or after the announcement's publication
 * date, as a local YYYY-MM-DD.
 *
 * Announcements say "perşembe günü" constantly and this arithmetic is ours, not
 * the model's. Asked to resolve one against a Sunday it answered Tuesday, five
 * times out of five — and it still did after being told the publication date's
 * weekday outright. It reads the day off the page; the counting happens here,
 * where it is a subtraction and cannot be wrong.
 *
 * "On or after", not "after": KIB-TEK publishes on the Wednesday that the work
 * is "perşembe günü", and one published on the day itself says it too (§10.4).
 */
function dateOfNext(weekday: Weekday, publishedAt: string): string {
  // Nicosia's calendar day, not UTC's — an announcement published at 01:00 local
  // is on the day the reader thinks it is.
  const local = nicosiaWallClock(Date.parse(publishedAt));
  const from = Date.UTC(local.year, local.month - 1, local.day);
  const target = WEEKDAYS.indexOf(weekday);
  // getUTCDay is Sunday-first; WEEKDAYS is Monday-first.
  const current = (new Date(from).getUTCDay() + 6) % 7;
  const ahead = (target - current + 7) % 7;
  return new Date(from + ahead * 86400000).toISOString().slice(0, 10);
}

function toIso(date: string, clock: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = clock.split(':').map(Number);
  if (!year || !month || !day) return null;
  return new Date(zonedTimeToUtc(year, month, day, hour, minute)).toISOString();
}
