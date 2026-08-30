import type { ArchivedOutage, DistrictId, MonthlyTotal, Outage } from './types';
import { getMockLastCheckedAt, getMockMonthlyTotals, getMockOutages } from './mock';
import { countAreaKeys, coversAreaKey } from './geography';
import {
  areaKeys,
  fetchAreaKeyCounts,
  fetchArchivedOutages,
  fetchDistrictOutages,
  fetchLastSuccessfulRunAt,
  fetchLiveOutages,
  fetchMonthlyTotals,
  fetchOutageByIdPrefix,
  fetchOutageRefs,
  fetchOutagesByAreaKey,
  type OutageRef,
} from './db';

// The single data seam (§8): every read in the app goes through this module.
// It reads mocks while USE_MOCKS=true and Supabase otherwise. Components never
// import mock.ts or touch the database directly.

const mocksEnabled = () => process.env.USE_MOCKS === 'true';

// The single injected "now": components read the clock once per request
// through the seam and pass the value down, so server and client agree and
// rendering stays testable.
export async function getNow(): Promise<number> {
  return Date.now();
}

// Active and upcoming outages, plus the recent past the home page needs.
export async function getOutages(now: number): Promise<Outage[]> {
  if (mocksEnabled()) return getMockOutages(now);
  return fetchLiveOutages(now);
}

// Finished outages for the archive. Retracted records stay here, marked
// cancelled, because the archive's value depends on history staying intact.
export async function getArchivedOutages(now: number): Promise<ArchivedOutage[]> {
  // The mocks describe a healthy day; none of them is a retraction.
  if (mocksEnabled()) return (await getMockOutages(now)).map((outage) => ({ ...outage, cancelled: false }));
  return fetchArchivedOutages(now);
}

// One outage, by the leading characters of its id — see lib/slug.ts for why
// the readable half of the URL is not what identifies it.
export async function getOutageByIdPrefix(now: number, prefix: string): Promise<ArchivedOutage | null> {
  if (mocksEnabled()) {
    const match = (await getMockOutages(now)).filter((outage) => outage.id.startsWith(prefix));
    // Same rule as the database path: an ambiguous prefix names no record
    // rather than an arbitrary one of them.
    return match.length === 1 ? { ...match[0], cancelled: false } : null;
  }
  return fetchOutageByIdPrefix(prefix);
}

// The rest of one district, for the cross-links at the foot of an outage page.
export async function getDistrictOutages(
  now: number,
  district: DistrictId,
  limit = 12,
): Promise<ArchivedOutage[]> {
  if (mocksEnabled()) {
    return (await getMockOutages(now))
      .filter((outage) => outage.district === district)
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
      .slice(0, limit)
      .map((outage) => ({ ...outage, cancelled: false }));
  }
  return fetchDistrictOutages(district, limit);
}

// Every record naming one settlement, newest first. `key` is a folded place
// name (lib/slug.ts `placeSlug` without the hyphens), never a display name.
export async function getOutagesByAreaKey(now: number, key: string): Promise<ArchivedOutage[]> {
  if (mocksEnabled()) {
    return (await getMockOutages(now))
      .filter((outage) => coversAreaKey({ keys: areaKeys(outage.areas), ...outage }, key))
      .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
      .map((outage) => ({ ...outage, cancelled: false }));
  }
  return fetchOutagesByAreaKey(key);
}

// How many records name each place — what decides whether a settlement has a
// page at all (§ settlement pages: a page carrying one outage is thin content).
export async function getAreaKeyCounts(now: number): Promise<Map<string, number>> {
  if (mocksEnabled()) {
    // Through the same rule the live query uses, so the mode the pages are built
    // in cannot disagree with the mode they are served in.
    return countAreaKeys(
      (await getMockOutages(now)).map((outage) => ({ keys: areaKeys(outage.areas), ...outage })),
    );
  }
  return fetchAreaKeyCounts();
}

// Just enough of each record to build its address and its sitemap lastmod.
export async function getOutageRefs(now: number, since: string): Promise<OutageRef[]> {
  if (mocksEnabled()) {
    return (await getMockOutages(now))
      .filter((outage) => outage.startsAt >= since)
      .map((outage) => ({
        id: outage.id,
        startsAt: outage.startsAt,
        district: outage.district,
        areas: outage.areas,
        updatedAt: outage.updatedAt ?? outage.ingestedAt,
      }));
  }
  return fetchOutageRefs(since);
}

export async function getMonthlyTotals(district: DistrictId, now: number): Promise<MonthlyTotal[]> {
  if (mocksEnabled()) return getMockMonthlyTotals(district, now);
  return fetchMonthlyTotals(district, now);
}

// Data freshness (§10.7). `lastCheckedAt` is the start of the most recent
// successful ingest run, never a hardcoded value. When that run is older than
// this, the UI says so: stale data presented as current is worse than an honest
// gap.
//
// Two hours, and it was one. The cron asks for every ten minutes and GitHub
// does not deliver it: measured over 110 scheduled runs, the median gap is 38
// minutes and p95 is 95. An hour is inside normal operation, so the warning was
// showing for 19% of the clock — about four and a half hours a day — which is
// not a warning any more, it is furniture, and a reader who sees it constantly
// stops reading it.
//
// Two hours sits above p95, so ordinary throttling does not trip it, and it
// still catches the thing worth catching: the worst real gap in that window was
// nine and a half hours. Raising it further buys almost nothing — past two
// hours the remaining time is one genuine stoppage, which is exactly what this
// is for.
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export type Freshness = {
  lastCheckedAt: string | null;
  stale: boolean;
};

export async function getFreshness(now: number): Promise<Freshness> {
  const lastCheckedAt = mocksEnabled() ? getMockLastCheckedAt(now) : await fetchLastSuccessfulRunAt();
  // Never having run is as stale as it gets.
  const stale = lastCheckedAt === null || now - Date.parse(lastCheckedAt) > STALE_AFTER_MS;
  return { lastCheckedAt, stale };
}
