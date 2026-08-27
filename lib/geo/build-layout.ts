import { geoMercator, geoPath } from 'd3-geo';
import type { Settlement } from '../types';
import type { MapGeometry } from '../geography';
import { DISTRICTS, DISTRICT_IDS } from '../districts';
import { MAP_WIDTH } from '../map-style';
import cyprusGeo from './cyprus.geo.json';
import settlementsData from './settlements.json';

// Build-time only. The projection and the district paths are computed here,
// once, and land in map-layout.json. Nothing in this file is imported by the
// app: at runtime lib/geography.ts just reads the result.
//
// This used to carry a search as well — a grid sweep per district looking for
// somewhere its name could be written that was on land, clear of the coast,
// clear of the other five names, and out of the lamp light. It was by far the
// most expensive thing here, and the reason the file had to know how bright the
// map is. The names are no longer written on the map (§3.6), so the search and
// the light measurement behind it are gone with them.
//
// Geometry is data, never literals. `cyprus.geo.json` carries the island
// coastline, the northern outline and the six district polygons in WGS84;
// `settlements.json` carries the lamps, one per name the ingest can match.
// Nothing here may be typed by hand — if a shape looks wrong, fix the data
// file, not the code.
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

  const districts = DISTRICT_IDS.map((id) => {
    const f = feature(id);
    return {
      id,
      name: DISTRICTS[id].name,
      path: path(f) ?? '',
      // Kept only so the smallest district's hit area can be stacked on top of
      // its neighbours' at render time.
      area: Math.round(path.area(f)),
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
