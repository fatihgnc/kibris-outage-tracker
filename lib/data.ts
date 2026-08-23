import type { DistrictId, MonthlyTotal, Outage } from './types';
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
export async function getArchivedOutages(now: number): Promise<Outage[]> {
  if (mocksEnabled()) return getMockOutages(now);
  return fetchArchivedOutages(now);
}

export async function getMonthlyTotals(district: DistrictId, now: number): Promise<MonthlyTotal[]> {
  if (mocksEnabled()) return getMockMonthlyTotals(district, now);
  return fetchMonthlyTotals(district, now);
}

// Data freshness (§10.7). `lastCheckedAt` is the start of the most recent
// successful ingest run, never a hardcoded value. When that run is older than
// an hour the UI says so: stale data presented as current is worse than an
// honest gap.
export const STALE_AFTER_MS = 60 * 60 * 1000;

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
