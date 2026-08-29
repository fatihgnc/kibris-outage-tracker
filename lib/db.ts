import type { ArchivedOutage, DistrictId, MonthlyTotal, Outage, SourceRef } from './types';
import { getAnonClient } from './supabase';
import { isDistrictId } from './geography';
import { bucketMonthlyTotals, nicosiaWallClock } from './time';
// The ingest's own Turkish-aware comparison key. `areas` holds the spelling the
// announcement used ('YENIBOGAZICI'), so anything that looks a record up by
// place has to fold both sides the same way.
import { foldKey } from '../ingest/parse/text';

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
  updated_at: string;
  area_keys: string[];
};

// Why a row was cancelled decides whether the archive may show it. A record
// the utility called off is news and stays, marked; one the ingest invented is
// not a retraction and must not be presented as one.
export type CancellationReason = 'retracted' | 'bad_data';

// One string literal, not a concatenation: supabase-js reads the column list
// off the literal to type the rows it returns. Exported because the ingest
// selects the same rows through `mapOutageRow`, and a second copy of this list
// would quietly fall behind the next column that gets added.
export const OUTAGE_COLUMNS =
  'id, utility, kind, starts_at, ends_at, district, areas, sources, published_at, ingested_at, confidence, cancelled_at, cancelled_reason, updated_at, area_keys';

// A record retired as bad data never described a real announcement, so it is
// excluded everywhere a reader could reach it. Spelled out rather than written
// as `cancelled_reason.neq.bad_data`, because in SQL that comparison is null —
// not true — for a row that was never cancelled, which drops the whole archive.
const NOT_BAD_DATA = 'cancelled_reason.is.null,cancelled_reason.neq.bad_data';

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
    updatedAt: row.updated_at,
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
    // Written here rather than computed in SQL: foldKey is Turkish-specific
    // (dotless i, the 'ç/ş/ğ' fold) and a plpgsql imitation of it would drift
    // from the one the ingest matches places with. `updated_at` is the mirror
    // case and is deliberately absent — the database trigger owns it.
    area_keys: areaKeys(outage.areas),
  };
}

/** The normalised place keys a record can be found by. Deduplicated and sorted so the stored array is stable across merges that only reorder `areas`. */
export function areaKeys(areas: readonly string[]): string[] {
  return [...new Set(areas.map(foldKey))].filter(Boolean).sort();
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
export async function fetchArchivedOutages(now: number, limit = 500): Promise<ArchivedOutage[]> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .lt('starts_at', new Date(now).toISOString())
    .or(NOT_BAD_DATA)
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchArchivedOutages: ${error.message}`);
  return (data as OutageRow[]).map((row) => ({ ...mapOutageRow(row), cancelled: row.cancelled_at !== null }));
}

/**
 * One outage, found by the leading characters of its id.
 *
 * The id is a content fingerprint (§10.5) and never changes once a row exists —
 * `mergeOutages` keeps the id of the record it merges into. That is what makes
 * it safe to put in a URL, where the readable part of the slug is not: a merge
 * can pull `startsAt` earlier and widen `areas`, so a slug derived from those
 * would stop matching the page it names.
 *
 * A retracted record is returned and the page says it was called off; one
 * retired as bad data is not, because no such outage was ever announced.
 */
export async function fetchOutageByIdPrefix(prefix: string): Promise<ArchivedOutage | null> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .like('id', `${prefix}%`)
    .or(NOT_BAD_DATA)
    .limit(2);
  if (error) throw new Error(`fetchOutageByIdPrefix: ${error.message}`);
  const rows = data as OutageRow[];
  // Two hits means the prefix is not specific enough to name one record. That
  // would be a bug in whatever built the link, and serving an arbitrary one of
  // them would put the wrong outage behind a shared URL.
  if (rows.length !== 1) return null;
  return { ...mapOutageRow(rows[0]), cancelled: rows[0].cancelled_at !== null };
}

/** Recent records in one district, for the "elsewhere in this district" links on an outage page. */
export async function fetchDistrictOutages(
  district: DistrictId,
  limit = 12,
): Promise<ArchivedOutage[]> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .eq('district', district)
    .or(NOT_BAD_DATA)
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchDistrictOutages: ${error.message}`);
  return (data as OutageRow[]).map((row) => ({ ...mapOutageRow(row), cancelled: row.cancelled_at !== null }));
}

/**
 * Every record naming one place, newest first.
 *
 * Matches on `area_keys`, the normalised mirror of `areas` written by
 * `toOutageRow`. `areas` itself holds whatever spelling the announcement used,
 * so `areas @> '{Gönyeli}'` would silently miss 'GONYELI' — the exact failure
 * `foldKey` exists to prevent. `contains` compiles to `@>`, which uses the GIN
 * index on the column.
 */
export async function fetchOutagesByAreaKey(key: string, limit = 200): Promise<ArchivedOutage[]> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select(OUTAGE_COLUMNS)
    .contains('area_keys', [key])
    .or(NOT_BAD_DATA)
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchOutagesByAreaKey: ${error.message}`);
  return (data as OutageRow[]).map((row) => ({ ...mapOutageRow(row), cancelled: row.cancelled_at !== null }));
}

/**
 * How many stored records name each place.
 *
 * Decides which settlement pages exist at all: a page carrying one outage is
 * thin content, and 193 settlements in two locales would be a lot of it.
 *
 * Counted in JavaScript over a single column rather than grouped in SQL —
 * Postgres cannot group by an array element without an unnest, which PostgREST
 * does not expose, and the alternative is a database view for an arithmetic
 * this cheap. The callers are the sitemap and the settlement pages, both of
 * which cache.
 */
export async function fetchAreaKeyCounts(): Promise<Map<string, number>> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select('area_keys')
    .or(NOT_BAD_DATA);
  if (error) throw new Error(`fetchAreaKeyCounts: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of data as { area_keys: string[] }[]) {
    // The stored array is already deduplicated, so one row counts once per place.
    for (const key of row.area_keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type OutageRef = Pick<Outage, 'id' | 'startsAt' | 'district' | 'areas'> & { updatedAt: string };

/** The columns the sitemap needs to build an outage's address and its lastmod, and nothing else. */
export async function fetchOutageRefs(since: string, limit = 2000): Promise<OutageRef[]> {
  const { data, error } = await getAnonClient()
    .from('outages')
    .select('id, starts_at, district, areas, updated_at')
    .gte('starts_at', since)
    .or(NOT_BAD_DATA)
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchOutageRefs: ${error.message}`);
  return (data as { id: string; starts_at: string; district: string; areas: string[]; updated_at: string }[])
    .filter((row) => isDistrictId(row.district))
    .map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      district: row.district as DistrictId,
      areas: row.areas,
      updatedAt: row.updated_at,
    }));
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

  // The bucketing itself is shared with the settlement chart (lib/time.ts), so
  // the two views cannot drift on how an outage with no announced end counts.
  return bucketMonthlyTotals(
    (data as { kind: Outage['kind']; starts_at: string; ends_at: string | null }[]).map((row) => ({
      kind: row.kind,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
    now,
  );
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
