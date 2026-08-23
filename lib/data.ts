import type { DistrictId, MonthlyTotal, Outage } from './types';
import { getMockLastCheckedAt, getMockMonthlyTotals, getMockOutages } from './mock';

// The single data seam (§8): every read in the app goes through this module.
// Components never import mock.ts or touch a database directly. In Phase B
// the non-mock branch is pointed at lib/db.ts (Supabase, anon key, read-only).

const mocksEnabled = () => process.env.USE_MOCKS !== 'false';

// The single injected "now" (§8): components read the clock once per request
// through the seam and pass the value down, so server and client agree and
// rendering stays testable.
export async function getNow(): Promise<number> {
  return Date.now();
}

function notImplemented(): never {
  throw new Error('Live data arrives in Phase B: implement lib/db.ts, then set USE_MOCKS=false.');
}

export async function getOutages(now: number): Promise<Outage[]> {
  if (mocksEnabled()) return getMockOutages(now);
  notImplemented();
}

export async function getMonthlyTotals(district: DistrictId, now: number): Promise<MonthlyTotal[]> {
  if (mocksEnabled()) return getMockMonthlyTotals(district, now);
  notImplemented();
}

// The status bar's "last checked" line. With live data this is the started_at
// of the most recent successful ingest_runs row.
export async function getLastCheckedAt(now: number): Promise<string> {
  if (mocksEnabled()) return getMockLastCheckedAt(now);
  notImplemented();
}
