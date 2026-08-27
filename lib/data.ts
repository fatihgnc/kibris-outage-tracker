import type { ArchivedOutage, DistrictId, MonthlyTotal, Outage } from './types';
import { getMockLastCheckedAt, getMockMonthlyTotals, getMockOutages } from './mock';
import {
  fetchArchivedOutages,
  fetchLastSuccessfulRunAt,
  fetchLiveOutages,
  fetchMonthlyTotals,
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
