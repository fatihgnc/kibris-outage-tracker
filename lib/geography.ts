import type { DistrictId, Outage, OutageScope } from './types';
// The ingest's own Turkish-aware comparison key, so an area name matches a lamp
// on exactly the terms it matched a place on the way in. Pure string work, no
// dependencies — importing it costs the client bundle nothing.
import { foldKey } from '../ingest/parse/text';
import { placeSlug } from './slug';
import mapLayout from './geo/map-layout.json';

// Re-exported so callers have one import for everything map-shaped.
export { DISTRICTS, DISTRICT_IDS, isDistrictId } from './districts';

export type MapDistrict = {
  id: DistrictId;
  name: string;
  path: string;
  /** Projected area in frame units, used to stack the smallest hit area on top. */
  area: number;
};

export type MapSettlement = {
  name: string;
  district: DistrictId;
  x: number;
  y: number;
};

export type MapGeometry = {
  viewBox: string;
  width: number;
  height: number;
  islandPath: string;
  northPath: string;
  districts: MapDistrict[];
  /** Sorted west to east — the ignition order comes from real longitude. */
  settlements: MapSettlement[];
};

/**
 * The projected map, read from the file `npm run build:map` writes. The
 * geometry only changes when the GeoJSON or the settlement list does, so it is
 * computed once at build time and never at request time. lib/geo/build-layout.ts
 * does that work; lib/geography.test.ts fails if the committed file has fallen
 * behind its inputs.
 */
export function getMapGeometry(): MapGeometry {
  return mapLayout as MapGeometry;
}

/**
 * What a lamp says about itself when it is out. Enough for the map to answer
 * the only questions a reader has at a point — is the power on, and if not,
 * what is this and until when — without the map component reaching for the
 * whole Outage record.
 */
export type SettlementOutage = {
  kind: Outage['kind'];
  startsAt: string;
  endsAt: string | null;
  /** The source that carried it, by name. Plain text — see IslandMap. */
  source: string;
  confidence: Outage['confidence'];
};

/**
 * Which lamps go out, and why.
 *
 * The map is lit place by place: an outage is villages going dark, and no
 * district is ever shaded by inference from a place name — that is the mistake
 * an early pass made, saying every village in Lefkosa was out when the record
 * named three. A district darkens only where the announcement itself said the
 * outage was district-wide, which is `scope` on the record rather than a guess
 * made here (SS3.3).
 *
 * Place-by-place only works because every name the ingest can match has a lamp:
 * `data/places.json` and `lib/geo/settlements.json` are kept in step by
 * `npm run harvest:coords`, and the test below fails if they drift. Two names
 * have no defensible coordinate and are declared in
 * `settlements.overrides.json`; an outage naming only those lights nothing here
 * and is read from the list under the map instead. Across 82 real archived
 * records both were only ever named alongside a place that does have one, so no
 * outage has yet gone unshown.
 *
 * Where a settlement is claimed twice, a record that names it beats a
 * district-wide one whatever the clocks say, and between two of the same scope
 * the earlier start wins.
 */
export function resolveDarkness(
  outages: readonly Pick<
    Outage,
    'kind' | 'startsAt' | 'endsAt' | 'district' | 'areas' | 'sources' | 'confidence' | 'scope'
  >[],
  settlements: readonly MapSettlement[] = getMapGeometry().settlements,
): Map<string, SettlementOutage> {
  const byKey = new Map<string, MapSettlement>();
  for (const s of settlements) byKey.set(foldKey(s.name), s);

  // Built from the `settlements` argument rather than from places.json: the map
  // is lit from this list, and expanding a district from anything else could
  // name a settlement that has no lamp to put out.
  const byDistrict = new Map<DistrictId, MapSettlement[]>();
  for (const s of settlements) {
    const list = byDistrict.get(s.district);
    if (list) list.push(s);
    else byDistrict.set(s.district, [s]);
  }

  const targets = (outage: (typeof outages)[number]): MapSettlement[] =>
    outage.scope === 'district'
      ? (byDistrict.get(outage.district) ?? [])
      : // Announcements name villages the way people do — 'YENIBOGAZICI' for
        // Yenibogazici. foldKey is the ingest's own comparison key, so what
        // matches here is exactly what matched when the record was parsed.
        outage.areas
          .map((area) => byKey.get(foldKey(area)))
          .filter((settlement) => settlement !== undefined);

  const collect = (subset: readonly (typeof outages)[number][]) => {
    const dark = new Map<string, SettlementOutage>();
    for (const outage of subset) {
      for (const settlement of targets(outage)) {
        const existing = dark.get(settlement.name);
        if (existing && Date.parse(existing.startsAt) <= Date.parse(outage.startsAt)) continue;
        dark.set(settlement.name, {
          kind: outage.kind,
          startsAt: outage.startsAt,
          endsAt: outage.endsAt,
          source: outage.sources[0]?.name ?? '',
          confidence: outage.confidence,
        });
      }
    }
    return dark;
  };

  // Two passes rather than one comparison. A district-wide record reaches a
  // settlement by our widening; a record that names it is evidence about it, and
  // the popover prints a kind, a clock and a source that ought to be the ones
  // actually written about that place. So the named readings are laid over the
  // inferred ones outright — otherwise an earlier district-wide fault would show
  // a village an open-ended 'since 04:00' over its own announced 09:00-13:00.
  // 'Earliest wins' then decides only between readings of the same kind, which
  // is the question it was ever answering.
  return new Map([
    ...collect(outages.filter((outage) => outage.scope === 'district')),
    ...collect(outages.filter((outage) => outage.scope !== 'district')),
  ]);
}

/**
 * The settlement one URL segment names, or null.
 *
 * Built off the same list the map is drawn from, so a settlement page can only
 * exist for a place that has a lamp — the two never disagree about which
 * places this site knows. `lib/slug.test.ts` fails if two settlements ever fold
 * to the same segment, which would make one of them unreachable.
 */
export function findSettlementBySlug(slug: string): MapSettlement | null {
  return settlementsBySlug().get(slug) ?? null;
}

/** Every settlement's URL segment, for the sitemap and for district cross-links. */
export function settlementSlugs(): { slug: string; settlement: MapSettlement }[] {
  return [...settlementsBySlug()].map(([slug, settlement]) => ({ slug, settlement }));
}

/**
 * The `area_keys` value of every settlement, grouped by district.
 *
 * A record with `scope: 'district'` names only its district (§3.3), so on its
 * own it is findable under one key — which for the six district names is the
 * town of the same name. This is what lets a query widen it to the places it
 * actually covers, without widening the stored `area_keys` and filing the record
 * under villages the announcement never wrote.
 */
export function areaKeysByDistrict(): ReadonlyMap<DistrictId, string[]> {
  if (!keysByDistrict) {
    const grouped = new Map<DistrictId, string[]>();
    for (const settlement of getMapGeometry().settlements) {
      const list = grouped.get(settlement.district);
      if (list) list.push(foldKey(settlement.name));
      else grouped.set(settlement.district, [foldKey(settlement.name)]);
    }
    keysByDistrict = grouped;
  }
  return keysByDistrict;
}

/**
 * How many records name each place — the number the settlement-page threshold is
 * read against (lib/places.ts).
 *
 * One rule, one place. The live query and the mock seam both used to count
 * `area_keys` and nothing else, which is the narrow reading of a district-wide
 * record: the island showed a village dark while its own page said nothing had
 * ever happened there, and the record did not count towards that page existing.
 *
 * A district-wide record counts for every settlement in its district, which is
 * what it says happened. Its keys are used *instead of* the stored ones rather
 * than as well as them — a district-scope record names its own district, and
 * that name is also a settlement, so counting both would count that town twice.
 */
export function countAreaKeys(
  records: readonly { keys: readonly string[]; scope: OutageScope; district: DistrictId }[],
): Map<string, number> {
  const byDistrict = areaKeysByDistrict();
  const counts = new Map<string, number>();
  for (const record of records) {
    const keys = record.scope === 'district' ? (byDistrict.get(record.district) ?? []) : record.keys;
    // Each list is already deduplicated, so one record counts once per place.
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether a record covers the settlement one `area_keys` value names.
 *
 * The narrow reading is the stored keys; a district-wide record covers every
 * settlement in its district without naming one of them (§3.3). Written once so
 * the live query, the mock seam and the counts above all answer it the same way.
 */
export function coversAreaKey(
  record: { keys: readonly string[]; scope: OutageScope; district: DistrictId },
  key: string,
): boolean {
  if (record.scope === 'district') return districtOfAreaKey(key) === record.district;
  return record.keys.includes(key);
}

/** The district an `area_keys` value belongs to, or null if no settlement has it. */
export function districtOfAreaKey(key: string): DistrictId | null {
  for (const [district, keys] of areaKeysByDistrict()) {
    if (keys.includes(key)) return district;
  }
  return null;
}

let keysByDistrict: Map<DistrictId, string[]> | null = null;
let slugIndex: Map<string, MapSettlement> | null = null;

function settlementsBySlug(): Map<string, MapSettlement> {
  if (!slugIndex) {
    slugIndex = new Map(getMapGeometry().settlements.map((s) => [placeSlug(s.name), s]));
  }
  return slugIndex;
}
