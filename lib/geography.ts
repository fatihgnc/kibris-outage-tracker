import { geoMercator, geoPath } from 'd3-geo';
import type { DistrictId, Settlement } from './types';

// Cyprus outline from Natural Earth 1:50m (public domain). `island` is the
// topological union of the "Cyprus" and "N. Cyprus" features; `north` is the
// active service area. Coordinates are real lon/lat — never edit by hand.
const ISLAND: GeoJSON.MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[[[34.0045, 35.0652], [34.0236, 35.0456], [34.0502, 34.9884], [33.9365, 34.9715], [33.8225, 34.9659], [33.759, 34.9732], [33.6994, 34.9699], [33.5144, 34.8064], [33.415, 34.7509], [33.2966, 34.7177], [33.1761, 34.698], [33.1155, 34.6956], [33.0623, 34.6748], [33.0249, 34.6369], [33.0239, 34.6], [33.0079, 34.5696], [32.9418, 34.5759], [32.9143, 34.6355], [32.8672, 34.6611], [32.7501, 34.6478], [32.693, 34.6494], [32.5056, 34.7063], [32.449, 34.7294], [32.4138, 34.778], [32.3172, 34.9533], [32.301, 35.083], [32.3909, 35.0498], [32.475, 35.09], [32.556, 35.1558], [32.6523, 35.1827], [32.7127, 35.171], [32.7724, 35.1596], [32.8799, 35.1806], [32.9264, 35.2781], [32.9416, 35.3904], [33.1234, 35.3582], [33.3078, 35.3415], [33.4588, 35.3359], [33.6076, 35.3542], [34.0635, 35.474], [34.1925, 35.5457], [34.2724, 35.57], [34.4111, 35.6293], [34.5561, 35.6621], [34.4632, 35.5935], [33.942, 35.292], [33.9079, 35.2024], [33.9313, 35.1404], [34.0045, 35.0652]]]],
};

const NORTH: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[34.0045, 35.0652], [33.9657, 35.0568], [33.9033, 35.0854], [33.8664, 35.0936], [33.832, 35.0672], [33.7923, 35.0482], [33.7569, 35.0397], [33.7258, 35.0373], [33.6754, 35.0179], [33.6145, 35.0228], [33.5257, 35.0387], [33.4758, 35.0003], [33.4639, 35.0049], [33.456, 35.1014], [33.4242, 35.1409], [33.3838, 35.1627], [33.3256, 35.1536], [33.2483, 35.1569], [33.191, 35.1731], [33.0775, 35.1462], [32.9859, 35.1164], [32.9195, 35.0878], [32.8694, 35.0894], [32.7841, 35.1158], [32.7202, 35.1454], [32.7127, 35.171], [32.7724, 35.1596], [32.8799, 35.1806], [32.9264, 35.2781], [32.9416, 35.3904], [33.1234, 35.3582], [33.3078, 35.3415], [33.4588, 35.3359], [33.6076, 35.3542], [34.0635, 35.474], [34.1925, 35.5457], [34.2724, 35.57], [34.4111, 35.6293], [34.5561, 35.6621], [34.4632, 35.5935], [33.942, 35.292], [33.9079, 35.2024], [33.9313, 35.1404], [34.0045, 35.0652]]],
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

// Real coordinates; every point passes through the same projection as the
// outline, so it can never drift off the coastline.
export const SETTLEMENTS: Settlement[] = [
  { name: 'Yeşilyurt', lat: 35.153, lng: 32.775, district: 'lefke' },
  { name: 'Lefke', lat: 35.111, lng: 32.85, district: 'lefke' },
  { name: 'Güzelyurt', lat: 35.199, lng: 32.993, district: 'guzelyurt' },
  { name: 'Lapta', lat: 35.339, lng: 33.17, district: 'girne' },
  { name: 'Alsancak', lat: 35.341, lng: 33.23, district: 'girne' },
  { name: 'Gönyeli', lat: 35.194, lng: 33.302, district: 'lefkosa' },
  { name: 'Girne', lat: 35.341, lng: 33.319, district: 'girne' },
  { name: 'Lefkoşa', lat: 35.176, lng: 33.365, district: 'lefkosa' },
  { name: 'Çatalköy', lat: 35.335, lng: 33.395, district: 'girne' },
  { name: 'Değirmenlik', lat: 35.234, lng: 33.404, district: 'lefkosa' },
  { name: 'Esentepe', lat: 35.346, lng: 33.617, district: 'girne' },
  { name: 'Akdoğan', lat: 35.117, lng: 33.741, district: 'gazimagusa' },
  { name: 'Tatlısu', lat: 35.383, lng: 33.78, district: 'iskele' },
  { name: 'İskele', lat: 35.29, lng: 33.887, district: 'iskele' },
  { name: 'Yeniboğaziçi', lat: 35.187, lng: 33.905, district: 'gazimagusa' },
  { name: 'Gazimağusa', lat: 35.125, lng: 33.939, district: 'gazimagusa' },
  { name: 'Yeni Erenköy', lat: 35.528, lng: 34.243, district: 'iskele' },
  { name: 'Dipkarpaz', lat: 35.601, lng: 34.383, district: 'iskele' },
];

export const MAP_VIEWBOX = { width: 1000, height: 592 };

export type MapPoint = {
  name: string;
  district: DistrictId;
  x: number;
  y: number;
};

export type MapGeometry = {
  viewBox: string;
  islandPath: string;
  northPath: string;
  points: MapPoint[];
};

let cached: MapGeometry | null = null;

export function getMapGeometry(): MapGeometry {
  if (cached) return cached;
  const projection = geoMercator().fitExtent(
    [
      [20, 18],
      [MAP_VIEWBOX.width - 20, MAP_VIEWBOX.height - 18],
    ],
    { type: 'Feature', geometry: ISLAND, properties: {} },
  );
  const path = geoPath(projection);
  const round = (n: number) => Math.round(n * 10) / 10;
  cached = {
    viewBox: `0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`,
    islandPath: path(ISLAND) ?? '',
    northPath: path(NORTH) ?? '',
    points: SETTLEMENTS.map((s) => {
      const projected = projection([s.lng, s.lat]);
      if (!projected) throw new Error(`Projection failed for ${s.name}`);
      return { name: s.name, district: s.district, x: round(projected[0]), y: round(projected[1]) };
    }),
  };
  return cached;
}
