import type { DistrictId } from './types';
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

// Announcements name villages the way people do; settlement names carry
// Turkish diacritics. Compare on a folded key so "Yeniboğaziçi" matches.
const fold = (value: string) =>
  value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');

export type DarkMap = {
  districts: Set<DistrictId>;
  settlements: Set<string>;
};

/**
 * Which lamps go out. When an outage names areas we recognise as settlements,
 * only those go dark and the rest of the district stays lit — a partial outage
 * has to read as partial. When nothing matches, the whole district goes dark,
 * because the alternative is showing an outage nobody can see.
 */
export function resolveDarkness(
  outages: { district: DistrictId; areas: string[] }[],
  settlements: readonly MapSettlement[] = getMapGeometry().settlements,
): DarkMap {
  const dark: DarkMap = { districts: new Set(), settlements: new Set() };
  const byDistrict = new Map<DistrictId, MapSettlement[]>();
  for (const s of settlements) {
    const list = byDistrict.get(s.district) ?? [];
    list.push(s);
    byDistrict.set(s.district, list);
  }

  for (const outage of outages) {
    dark.districts.add(outage.district);
    const inDistrict = byDistrict.get(outage.district) ?? [];
    const named = outage.areas.map(fold);
    const matched = inDistrict.filter((s) => named.includes(fold(s.name)));
    for (const s of matched.length > 0 ? matched : inDistrict) {
      dark.settlements.add(s.name);
    }
  }
  return dark;
}
