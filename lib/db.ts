import type { ArchivedOutage, DistrictId, MonthlyTotal, Outage, SourceRef } from './types';
import { getAnonClient } from './supabase';
import { isDistrictId } from './geography';
import { nicosiaWallClock } from './time';

// Every Supabase query lives here, and column mapping between snake_case rows
// and the camelCase types in lib/types.ts happens here and nowhere else
// (§8.1). No component imports the client directly.

export type OutageRow = {
  id: string;
  utility: 'electricity';
  kind: Outage['kind'];
  starts_at: string;
  ends_at: string | null;
  district: string;
  areas: string[];
  sources: SourceRef[];
  published_at: string;
  ingested_at: string;
  confidence: Outage['confidence'];
  cancelled_at: string | null;
  cancelled_reason: CancellationReason | null;
};

// Why a row was cancelled decides whether the archive may show it. A record
// the utility called off is news and stays, marked; one the ingest invented is
// not a retraction and must not be presented as one.
export type CancellationReason = 'retracted' | 'bad_data';

// One string literal, not a concatenation: supabase-js reads the column list
// off the literal to type the rows it returns.
const OUTAGE_COLUMNS =
  'id, utility, kind, starts_at, ends_at, district, areas, sources, published_at, ingested_at, confidence, cancelled_at, cancelled_reason';

export function mapOutageRow(row: OutageRow): Outage {
  if (!isDistrictId(row.district)) {
    throw new Error(`Unknown district "${row.district}" on outage ${row.id}`);
  }
  return {
    id: row.id,
    utility: row.utility,
    kind: row.kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    district: row.district,
    areas: row.areas,
    sources: row.sources,
    publishedAt: row.published_at,
    ingestedAt: row.ingested_at,
    confidence: row.confidence,
  };
}

// Deliberately writes no cancellation columns. The ingest upserts through this
// on every run, and a payload carrying `cancelled_at: null` would clear the
// retraction on any row whose fingerprint comes round again — quietly reviving
// a record that was called off, or one retired as bad data. Cancelling is
// retractOutages' job alone; on insert the columns take their null default.
export function toOutageRow(outage: Outage) {
  return {
    id: outage.id,
    utility: outage.utility,
    kind: outage.kind,
    starts_at: outage.startsAt,
    ends_at: outage.endsAt,
    district: outage.district,
    areas: outage.areas,
    sources: outage.sources,
    published_at: outage.publishedAt,
    ingested_at: outage.ingestedAt,
    confidence: outage.confidence,
  };
}

// Retracted records disappear from active and upcoming views but stay in the
// archive marked as cancelled (§10.6), so the live views filter them out here.
export async function fetchLiveOutages(now: number): Promise<Outage[]> {
  const horizon = new Date(now - 30 * 86400000).toISOString();
  const { data, error } = await getAnonClient()
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .is('cancelled_at', null)
    .gte('starts_at', horizon)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`fetchLiveOutages: ${error.message}`);
  return (data as OutageRow[]).map(mapOutageRow);
}

// Retracted records belong here, marked cancelled (§10.6) — that a planned
// outage was called off is exactly the kind of thing the archive exists to
// remember. Records retired as bad data are the opposite: they never described
// a real announcement, and listing one as a retraction would tell the reader an
// outage was announced and cancelled when neither happened.
//
// The null case has to be spelled out: in SQL `cancelled_reason <> 'bad_data'`
// is null, not true, for a row that was never cancelled, which would drop the
// entire live archive.
export async function fetchArchivedOutages(now: number, limit = 500): Promise<ArchivedOutage[]> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .lt('starts_at', new Date(now).toISOString())
    .or('cancelled_reason.is.null,cancelled_reason.neq.bad_data')
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchArchivedOutages: ${error.message}`);
  return (data as OutageRow[]).map((row) => ({ ...mapOutageRow(row), cancelled: row.cancelled_at !== null }));
}

// Twelve months of totals for one district, bucketed in the island's zone.
export async function fetchMonthlyTotals(district: DistrictId, now: number): Promise<MonthlyTotal[]> {
  const wall = nicosiaWallClock(now);
  const start = new Date(Date.UTC(wall.year, wall.month - 12, 1)).toISOString();
  const { data, error } = await getAnonClient()
    .from('outages')
    .select('kind, starts_at, ends_at')
    .eq('district', district)
    .is('cancelled_at', null)
    .gte('starts_at', start);
  if (error) throw new Error(`fetchMonthlyTotals: ${error.message}`);

  const buckets = new Map<string, MonthlyTotal>();
  for (let i = 11; i >= 0; i--) {
    const monthIndex = wall.month - 1 - i;
    const year = wall.year + Math.floor(monthIndex / 12);
    const month = (((monthIndex % 12) + 12) % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    buckets.set(key, { month: key, plannedHours: 0, faultHours: 0 });
  }

  for (const row of data as { kind: Outage['kind']; starts_at: string; ends_at: string | null }[]) {
    const startWall = nicosiaWallClock(Date.parse(row.starts_at));
    const key = `${startWall.year}-${String(startWall.month).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    // A fault with no announced end contributes nothing rather than an
    // invented duration — the chart must not imply data we do not have.
    if (!row.ends_at) continue;
    const hours = (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 3600000;
    if (hours <= 0) continue;
    if (row.kind === 'fault') bucket.faultHours += hours;
    else bucket.plannedHours += hours;
  }

  return [...buckets.values()].map((bucket) => ({
    month: bucket.month,
    plannedHours: Math.round(bucket.plannedHours),
    faultHours: Math.round(bucket.faultHours),
  }));
}

// "Last checked" is the most recent successful ingest run, never a hardcoded
// value (§8.1). Null when the ingest has never completed a run.
export async function fetchLastSuccessfulRunAt(): Promise<string | null> {
  const { data, error } = await getAnonClient()
    .from('ingest_runs')
    .select('started_at')
    .eq('ok', true)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`fetchLastSuccessfulRunAt: ${error.message}`);
  return (data as { started_at: string }[])[0]?.started_at ?? null;
}
