import { geoContains, geoMercator, geoPath } from 'd3-geo';
import type { Settlement } from '../types';
import type { MapGeometry } from '../geography';
import { DISTRICTS, DISTRICT_IDS } from '../districts';
import {
  LABEL_COAST_GAP,
  LABEL_PX,
  LABEL_REFERENCE_SCALE,
  MAP_WIDTH,
  glowOpacity,
  glowRadius,
} from '../map-style';
import cyprusGeo from './cyprus.geo.json';
import settlementsData from './settlements.json';

// Build-time only. The projection, the district paths and — the expensive part
// — the search for where each of the six district names can be written all run
// here, once, and land in map-layout.json. Nothing in this file is imported by
// the app: at runtime lib/geography.ts just reads the result.
//
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

export const SETTLEMENTS = settlementsData as Settlement[];

const PAD = 20;
// Sweep resolution for label placement. This is paid once at build time, so it
// is set for the answer rather than for the clock.
const GRID = 140;
// Above this the lamp light swallows muted text.
const LIGHT_LIMIT = 0.2;

export function computeMapGeometry(): MapGeometry {
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
  projection.translate([tx + (width - (bounds[0][0] + bounds[1][0])) / 2, ty + PAD - bounds[0][1]]);
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
    const pts = ring
      .map((c) => projection(c as [number, number]))
      .filter(Boolean) as [number, number][];
    for (let i = 0; i < pts.length - 1; i++) {
      coastSegments.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    }
  }
  // Squared throughout, one square root at the end: this runs a few million
  // times while the labels are placed.
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
  // runs into the sea.
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
  type LabelBox = ReturnType<typeof labelBox>;
  const overlaps = (a: LabelBox, b: LabelBox) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  // The brightest point under the label: lamps are blended with `screen`, so
  // overlapping light accumulates the same way here as it does on the map.
  const lightUnder = (box: LabelBox) => {
    let brightest = 0;
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 2; j++) {
        const x = box.x0 + ((box.x1 - box.x0) * i) / 6;
        const y = box.y0 + ((box.y1 - box.y0) * j) / 2;
        let clear = 1;
        for (let k = 0; k < SETTLEMENTS.length; k++) {
          const radius = glowRadius(SETTLEMENTS[k].weight);
          const distance = Math.hypot(
            projectedSettlements[k][0] - x,
            projectedSettlements[k][1] - y,
          );
          if (distance < radius) clear *= 1 - glowOpacity(distance / radius);
        }
        brightest = Math.max(brightest, 1 - clear);
      }
    }
    return brightest;
  };

  // Centre plus the four corners: the whole name has to be on land, not just
  // the point it is anchored at.
  const probes = (box: LabelBox): [number, number][] => [
    [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2],
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x0, box.y1],
    [box.x1, box.y1],
  ];

  const placed: LabelBox[] = [];
  const placeLabel = (f: GeoJSON.Feature<GeoJSON.Polygon>, label: string): [number, number] => {
    const centroid = path.centroid(f);
    // A grid over the district's bounding box, because rings around the
    // centroid cannot find the widest part of a district that is a narrow
    // coastal strip — Gazimağusa is one. Drift is penalised in the score, so
    // this only wins when the middle genuinely has no room.
    const candidates: [number, number][] = [centroid];
    const [[bx0, by0], [bx1, by1]] = path.bounds(f);
    for (let gx = 0; gx <= GRID; gx++) {
      for (let gy = 0; gy <= GRID; gy++) {
        candidates.push([bx0 + ((bx1 - bx0) * gx) / GRID, by0 + ((by1 - by0) * gy) / GRID]);
      }
    }

    // Constraints in the order they may be given up. Sitting inside its own
    // district is nearly the last thing a name concedes — a label over the
    // wrong district is wrong, where a label a little tighter to the shore is
    // only tight. Landing in the water is never conceded at all.
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
        // Cheapest gates first: the grid is large, and each corner check costs
        // an inverse projection and a walk of the coastline.
        if (coastDistance(c[0], c[1]) < rule.clearance) continue;
        if (rule.ownDistrict) {
          const lonLat = projection.invert?.(c);
          if (!lonLat || !geoContains(f, lonLat)) continue;
        }
        const box = labelBox(label, c[0], c[1]);
        if (rule.noCollision && placed.some((p) => overlaps(p, box))) continue;
        const corners = probes(box);
        const clearance = Math.min(...corners.map(([px, py]) => coastDistance(px, py)));
        if (clearance < rule.clearance) continue;
        // The whole name has to be on land, not just far from the contour: a
        // point out at sea is "far from the coast" too.
        if (
          corners.some(([px, py]) => {
            const lonLat = projection.invert?.([px, py]);
            return !lonLat || !geoContains(island, lonLat);
          })
        ) {
          continue;
        }
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
    return {
      id,
      name: DISTRICTS[id].name,
      label,
      path: path(f) ?? '',
      labelX: round((lx / width) * 1000) / 1000,
      labelY: round((ly / height) * 1000) / 1000,
      area: Math.round(path.area(f)),
      lightUnder: Math.round(lightUnder(labelBox(label, lx, ly)) * 1000) / 1000,
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

  return {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    islandPath: path(island) ?? '',
    northPath: path(feature('north')) ?? '',
    districts,
    settlements,
  };
}
