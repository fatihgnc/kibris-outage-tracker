import { geoContains, geoMercator, geoPath } from 'd3-geo';
import type { DistrictId, Settlement } from './types';
import cyprusGeo from './geo/cyprus.geo.json';
import settlementsData from './geo/settlements.json';

// Geometry is data, never literals. `cyprus.geo.json` carries the island
// coastline, the northern outline and the six district polygons in WGS84;
// `settlements.json` carries the 26 lamps. Nothing here may be typed by hand —
// if a shape looks wrong, fix the data file, not the code.
const FEATURES = cyprusGeo as unknown as GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  { id: string; kind?: string }
>;

const feature = (id: string) => {
  const found = FEATURES.features.find((f) => f.properties.id === id);
  if (!found) throw new Error(`cyprus.geo.json is missing the "${id}" feature`);
  return found;
};

export const DISTRICT_IDS: DistrictId[] = [
  'lefkosa',
  'girne',
  'gazimagusa',
  'guzelyurt',
  'iskele',
  'lefke',
];

// Place names are data, not code — they stay in their real Turkish spelling.
// The English exonym appears on the district page heading only (§7.3).
export const DISTRICTS: Record<DistrictId, { name: string; exonym?: string }> = {
  lefkosa: { name: 'Lefkoşa', exonym: 'Nicosia' },
  girne: { name: 'Girne', exonym: 'Kyrenia' },
  gazimagusa: { name: 'Gazimağusa', exonym: 'Famagusta' },
  guzelyurt: { name: 'Güzelyurt' },
  iskele: { name: 'İskele' },
  lefke: { name: 'Lefke' },
};

export function isDistrictId(value: string): value is DistrictId {
  return (DISTRICT_IDS as string[]).includes(value);
}

export const SETTLEMENTS = settlementsData as Settlement[];

// The frame is one thousand units wide; its height falls out of the island's
// own proportions, so no coastline is ever cropped by a hand-picked number.
export const MAP_WIDTH = 1000;
const PAD = 20;

/** §3.7: the map is capped so the outage list starts before the fold. */
export const MAX_MAP_HEIGHT = 480;
/** Font size of the six permanent district labels, in CSS pixels. */
export const LABEL_PX = 9;
// All six labels appear from this width up, where the column is narrowest and
// the frame therefore smallest. Sizing the placement maths for that worst case
// means a label that clears the coast here clears it everywhere; on a wide
// screen it simply has more room than it claimed.
//
// 768 rather than 640: GAZİMAĞUSA is the longest name and its district the
// narrowest strip, and at a 640px column the name cannot be written inside it
// with any real gap to the shore — measured best case 7px. At 768 it clears
// 14px. Below that width only districts under an outage are named, which is
// the rule either way; this only moves where it starts.
export const LABEL_BREAKPOINT = 768;
const LABEL_REFERENCE_SCALE = (LABEL_BREAKPOINT - 40) / MAP_WIDTH;
/** Minimum gap between a label and the coastline, in CSS pixels. */
const LABEL_COAST_GAP = 14;

// A lamp is a stain of light, not a dot: the radius scales with the weight the
// data carries, so a city spills further than a village. The map draws these;
// label placement reads them, because what a label has to stay clear of is the
// light, not the point it comes from.
export const GLOW_RADIUS = { 3: 60, 2: 43, 1: 28 } as const;
export const CORE_RADIUS = { 3: 2.8, 2: 2.1, 1: 1.5 } as const;
export const glowRadius = (weight: number) =>
  GLOW_RADIUS[weight as 1 | 2 | 3] ?? GLOW_RADIUS[1];
export const coreRadius = (weight: number) =>
  CORE_RADIUS[weight as 1 | 2 | 3] ?? CORE_RADIUS[1];
// The gradient the map paints, as numbers: offset to opacity. Label placement
// evaluates this rather than measuring to the lamp's centre — what buries a
// name is how bright the light is under it, and a lamp's centre says nothing
// about that on its own.
const GLOW_STOPS: [number, number][] = [
  [0, 0.85],
  [0.16, 0.46],
  [0.38, 0.19],
  [0.66, 0.055],
  [1, 0],
];
const glowOpacity = (t: number) => {
  if (t >= 1) return 0;
  for (let i = 1; i < GLOW_STOPS.length; i++) {
    const [x1, y1] = GLOW_STOPS[i];
    if (t <= x1) {
      const [x0, y0] = GLOW_STOPS[i - 1];
      return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
    }
  }
  return 0;
};

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

let cached: MapGeometry | null = null;

export function getMapGeometry(): MapGeometry {
  if (cached) return cached;
  const island = feature('island');
  const width = MAP_WIDTH;
  const inner = width - PAD * 2;

  // The north is the fit target: it is the service area, so it sets the scale.
  // It is then pulled back by exactly the island's overhang, which is a fixed
  // proportion of the shape rather than a pixel guess — the whole coastline
  // fits at every frame size, and the north still fills the frame.
  const projection = geoMercator().fitWidth(inner, feature('north'));
  const overhang = geoPath(projection).bounds(island);
  projection.scale((projection.scale() * inner) / (overhang[1][0] - overhang[0][0]));

  // Centre the island: equal air left and right, PAD above and below.
  const bounds = geoPath(projection).bounds(island);
  const [tx, ty] = projection.translate();
  projection.translate([
    tx + (width - (bounds[0][0] + bounds[1][0])) / 2,
    ty + PAD - bounds[0][1],
  ]);
  const height = Math.round(bounds[1][1] - bounds[0][1]) + PAD * 2;
  const path = geoPath(projection);
  const round = (n: number) => Math.round(n * 10) / 10;

  const projectedSettlements = SETTLEMENTS.map((s) => {
    const projected = projection([s.lng, s.lat]);
    if (!projected) throw new Error(`Projection failed for ${s.name}`);
    return projected;
  });

  // Distance from a point to the coastline, in frame units. A label that
  // crosses the contour is unreadable — half of it ends up in the water — so
  // placement needs to know where the water starts, not just which polygon a
  // point falls in.
  const coastSegments: [number, number, number, number][] = [];
  for (const ring of island.geometry.coordinates) {
    const pts = ring.map((c) => projection(c as [number, number])).filter(Boolean) as [number, number][];
    for (let i = 0; i < pts.length - 1; i++) {
      coastSegments.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    }
  }
  // Squared throughout, one square root at the end: this runs a few hundred
  // thousand times while the labels are placed.
  const coastDistance = (x: number, y: number) => {
    let best = Infinity;
    for (const [ax, ay, bx, by] of coastSegments) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
      const ex = x - (ax + t * dx);
      const ey = y - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  // The label wants the centroid, but the centroid is often exactly where the
  // light is, two neighbouring names can land on top of each other, and a
  // coastal district's centre sits close enough to the shore that the name
  // runs into the sea. Try the centroid, then rings around it, and keep the
  // candidate that clears all three while drifting least.
  //
  // The label is HTML at a fixed pixel size, so its footprint in frame units
  // depends on how large the frame is drawn; see LABEL_REFERENCE_SCALE.
  const LABEL_EM = LABEL_PX / LABEL_REFERENCE_SCALE;
  const CLEARANCE = LABEL_COAST_GAP / LABEL_REFERENCE_SCALE;
  const labelBox = (label: string, x: number, y: number) => {
    const halfWidth = (label.length * LABEL_EM * 0.74) / 2;
    const halfHeight = LABEL_EM * 0.6;
    return { x0: x - halfWidth - 5, x1: x + halfWidth + 5, y0: y - halfHeight, y1: y + halfHeight };
  };
  const overlaps = (a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  // The brightest point under the label: lamps are blended with `screen`, so
  // overlapping light accumulates the same way here as it does on the map.
  const lightUnder = (box: ReturnType<typeof labelBox>) => {
    let brightest = 0;
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 2; j++) {
        const x = box.x0 + ((box.x1 - box.x0) * i) / 6;
        const y = box.y0 + ((box.y1 - box.y0) * j) / 2;
        let clear = 1;
        for (let k = 0; k < SETTLEMENTS.length; k++) {
          const radius = glowRadius(SETTLEMENTS[k].weight);
          const distance = Math.hypot(projectedSettlements[k][0] - x, projectedSettlements[k][1] - y);
          if (distance < radius) clear *= 1 - glowOpacity(distance / radius);
        }
        brightest = Math.max(brightest, 1 - clear);
      }
    }
    return brightest;
  };
  // Above this the lamp light swallows muted text. Measured against the
  // rendered map, not guessed.
  const LIGHT_LIMIT = 0.2;
  // Centre plus the four corners: the whole name has to be on land, not just
  // the point it is anchored at.
  const probes = (box: ReturnType<typeof labelBox>): [number, number][] => [
    [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2],
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x0, box.y1],
    [box.x1, box.y1],
  ];

  const placed: ReturnType<typeof labelBox>[] = [];
  const placeLabel = (f: GeoJSON.Feature<GeoJSON.Polygon>, label: string): [number, number] => {
    const centroid = path.centroid(f);
    const candidates: [number, number][] = [centroid];
    for (const radius of [18, 34, 52, 72, 95]) {
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8;
        candidates.push([centroid[0] + Math.cos(angle) * radius, centroid[1] + Math.sin(angle) * radius]);
      }
    }
    // Rings around the centroid cannot find the widest part of a district
    // that is a narrow coastal strip — Gazimağusa is one — so also sweep a
    // grid over its bounding box. Drift is still penalised, so this only wins
    // when the middle genuinely has no room.
    // The grid has to be fine enough to find a narrow strip: at a coarse
    // step the one workable spot in Gazimağusa falls between samples.
    const GRID = 56;
    const [[bx0, by0], [bx1, by1]] = path.bounds(f);
    for (let gx = 0; gx <= GRID; gx++) {
      for (let gy = 0; gy <= GRID; gy++) {
        candidates.push([bx0 + ((bx1 - bx0) * gx) / GRID, by0 + ((by1 - by0) * gy) / GRID]);
      }
    }

    // Hard gates, then one score. Clearance is rewarded rather than merely
    // permitted, up to the point where more of it stops mattering: a straight
    // threshold made the outcome depend on whether the grid happened to land
    // on the one workable spot in a narrow district.
    const MIN_CLEARANCE = CLEARANCE * 0.5;
    const relaxations = [
      { ownDistrict: true, noCollision: true, clearance: MIN_CLEARANCE, light: LIGHT_LIMIT },
      { ownDistrict: true, noCollision: false, clearance: MIN_CLEARANCE, light: LIGHT_LIMIT },
      { ownDistrict: true, noCollision: true, clearance: MIN_CLEARANCE, light: LIGHT_LIMIT * 2 },
      { ownDistrict: true, noCollision: false, clearance: MIN_CLEARANCE, light: 1 },
      { ownDistrict: false, noCollision: true, clearance: MIN_CLEARANCE, light: 1 },
      { ownDistrict: false, noCollision: false, clearance: 2, light: 1 },
    ];

    for (const rule of relaxations) {
      let best: [number, number] | null = null;
      let bestScore = -Infinity;
      for (const c of candidates) {
        // Cheapest gates first: the grid is large, and each corner check
        // costs an inverse projection and a walk of the coastline.
        const centreClearance = coastDistance(c[0], c[1]);
        if (centreClearance < rule.clearance) continue;
        if (rule.ownDistrict) {
          const lonLat = projection.invert?.(c);
          if (!lonLat || !geoContains(f, lonLat)) continue;
        }
        const box = labelBox(label, c[0], c[1]);
        if (rule.noCollision && placed.some((p) => overlaps(p, box))) continue;
        const corners = probes(box);
        const clearance = Math.min(...corners.map(([px, py]) => coastDistance(px, py)));
        if (clearance < rule.clearance) continue;
        // The whole name has to be on land, not just far from the contour:
        // a point out at sea is "far from the coast" too.
        if (corners.some(([px, py]) => {
          const lonLat = projection.invert?.([px, py]);
          return !lonLat || !geoContains(island, lonLat);
        })) continue;

        const light = lightUnder(box);
        if (light > rule.light) continue;

        // Staying near the centre is what makes a label read as this
        // district's name, so drift is the counterweight. The light term is
        // deliberately unclamped: above the limit every candidate would
        // otherwise score alike, and the darkest spot in a district that has
        // no dark spot is exactly the one worth finding.
        const drift = Math.hypot(c[0] - centroid[0], c[1] - centroid[1]);
        const score = Math.min(clearance, CLEARANCE) * 4 - light * 150 - drift;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best) {
        placed.push(labelBox(label, best[0], best[1]));
        return best;
      }
    }
    placed.push(labelBox(label, centroid[0], centroid[1]));
    return centroid;
  };

  const districts = DISTRICT_IDS.map((id) => {
    const f = feature(id);
    const label = DISTRICTS[id].name.toLocaleUpperCase('tr');
    const [lx, ly] = placeLabel(f, label);
    const light = lightUnder(labelBox(label, lx, ly));
    return {
      id,
      name: DISTRICTS[id].name,
      label,
      path: path(f) ?? '',
      labelX: round((lx / width) * 1000) / 1000,
      labelY: round((ly / height) * 1000) / 1000,
      area: Math.round(path.area(f)),
      lightUnder: Math.round(light * 1000) / 1000,
    };
  });

  const settlements = [...SETTLEMENTS]
    .sort((a, b) => a.lng - b.lng)
    .map((s) => {
      const projected = projection([s.lng, s.lat]);
      if (!projected) throw new Error(`Projection failed for ${s.name}`);
      return {
        name: s.name,
        district: s.district,
        weight: s.weight,
        x: round(projected[0]),
        y: round(projected[1]),
      };
    });

  cached = {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    islandPath: path(feature('island')) ?? '',
    northPath: path(feature('north')) ?? '',
    districts,
    settlements,
  };
  return cached;
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
