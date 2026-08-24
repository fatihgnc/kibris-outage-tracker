import type { DistrictId } from './types';

// The district table, kept free of the map data so the build script that
// generates lib/geo/map-layout.json can read it without importing the module
// that reads that file.
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
