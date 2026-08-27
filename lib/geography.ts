import type { DistrictId, Outage } from './types';
// The ingest's own Turkish-aware comparison key, so an area name matches a lamp
// on exactly the terms it matched a place on the way in. Pure string work, no
// dependencies — importing it costs the client bundle nothing.
import { foldKey } from '../ingest/parse/text';
import mapLayout from './geo/map-layout.json';

// Re-exported so callers have one import for everything map-shaped.
export { DISTRICTS, DISTRICT_IDS, isDistrictId } from './districts';

export type MapDistrict = {
  id: DistrictId;
  name: string;
  /** Uppercased for the map label. Turkish casing: i becomes İ, never I. */
  label: string;
  path: string;
  /** Fraction of the frame, so the label can be positioned outside the SVG. */
  labelX: number;
  labelY: number;
  /** Projected area in frame units, used to stack the smallest hit area on top. */
  area: number;
  /**
   * Brightest lamp light under the label, 0–1. The map is lit everywhere the
   * districts are, so this is never zero; the labels carry a soft shadow, and
   * this says how hard that shadow has to work.
   */
  lightUnder: number;
};

export type MapSettlement = {
  name: string;
  district: DistrictId;
  weight: number;
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
 * geometry only changes when the GeoJSON does, and the label search behind it
 * costs a second, so it is computed once at build time and never at request
 * time. lib/geo/build-layout.ts does that work; lib/geography.test.ts fails if
 * the committed file has fallen behind its inputs.
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
 * The map is lit place by place and nothing else: an outage is one or more
 * villages going dark, not a district being shaded. That only works because
 * every name the ingest can match has a lamp — `data/places.json` and
 * `lib/geo/settlements.json` are kept in step by `npm run harvest:coords`, and
 * the test below fails if they drift. Two names have no defensible coordinate
 * and are declared in `settlements.overrides.json`; an outage naming only
 * those lights nothing here and is read from the list under the map instead.
 *
 * Where a settlement is named by more than one active outage, the one that
 * started first wins — it is the one that has been dark longest.
 */
export function resolveDarkness(
  outages: readonly Pick<Outage, 'kind' | 'startsAt' | 'endsAt' | 'areas' | 'sources' | 'confidence'>[],
  settlements: readonly MapSettlement[] = getMapGeometry().settlements,
): Map<string, SettlementOutage> {
  const byKey = new Map<string, MapSettlement>();
  for (const s of settlements) byKey.set(foldKey(s.name), s);

  const dark = new Map<string, SettlementOutage>();
  for (const outage of outages) {
    for (const area of outage.areas) {
      // Announcements name villages the way people do — 'YENIBOGAZICI' for
      // Yeniboğaziçi. foldKey is the ingest's own comparison key, so what
      // matches here is exactly what matched when the record was parsed.
      const settlement = byKey.get(foldKey(area));
      if (!settlement) continue;
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
}
