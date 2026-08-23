import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DistrictId } from '../../lib/types';
import { DISTRICT_IDS } from '../../lib/geography';
import { foldKey, similarity, stripApostropheSuffix } from './text';

export type Place = {
  name: string;
  district: DistrictId;
  aliases: string[];
};

export type PlaceMatch = {
  name: string; // canonical Turkish spelling
  district: DistrictId;
  fuzzy: boolean; // true = matched below exact, logged for review
  matchedText: string; // what the announcement actually said
};

type PlacesFile = { places: Place[] };

const PLACES_PATH = fileURLToPath(new URL('../../data/places.json', import.meta.url));

// Fuzzy matching only rescues near-misses (a dropped letter, a typo). Below
// this it is safer to send the announcement to review than to guess a village.
const FUZZY_THRESHOLD = 0.9;
const MIN_FUZZY_LENGTH = 5;

let cache: { places: Place[]; byKey: Map<string, Place> } | null = null;

function load() {
  if (cache) return cache;
  const parsed = JSON.parse(readFileSync(PLACES_PATH, 'utf8')) as PlacesFile;
  const places = parsed.places;
  for (const place of places) {
    if (!DISTRICT_IDS.includes(place.district)) {
      throw new Error(`places.json: unknown district "${place.district}" for ${place.name}`);
    }
  }
  const byKey = new Map<string, Place>();
  for (const place of places) {
    for (const spelling of [place.name, ...place.aliases]) {
      const key = foldKey(spelling);
      // Longer canonical names win a collision ('Yeni Erenköy' over 'Erenköy').
      const existing = byKey.get(key);
      if (!existing || existing.name.length < place.name.length) byKey.set(key, place);
    }
  }
  cache = { places, byKey };
  return cache;
}

export function allPlaces(): Place[] {
  return load().places;
}

// Extracts every settlement named in an announcement, in the order they first
// appear. Matching is done on folded n-grams so 'YENİ ERENKÖY' and
// 'Yeni Erenkoy' both resolve, and multi-word names are preferred over the
// single words inside them.
export function matchPlaces(text: string): PlaceMatch[] {
  const { byKey, places } = load();
  const maxWords = Math.max(...places.map((p) => p.name.split(/\s+/).length));
  const tokens = tokenize(text);
  const matches: PlaceMatch[] = [];
  const seen = new Set<string>();

  let index = 0;
  while (index < tokens.length) {
    let consumed = 0;
    for (let span = Math.min(maxWords, tokens.length - index); span >= 1; span--) {
      const slice = tokens.slice(index, index + span);
      const key = foldKey(slice.map((t) => t.text).join(' '));
      if (!key) continue;
      const exact = byKey.get(key);
      if (exact) {
        record(exact, slice.map((t) => t.text).join(' '), false);
        consumed = span;
        break;
      }
    }
    if (!consumed) {
      // Single-token fuzzy pass for typos, never for short words.
      const token = tokens[index];
      const key = foldKey(token.text);
      if (key.length >= MIN_FUZZY_LENGTH && /^[a-zçğıöşüA-ZÇĞİÖŞÜ]/.test(token.text)) {
        let best: { place: Place; score: number } | null = null;
        for (const place of places) {
          for (const spelling of [place.name, ...place.aliases]) {
            const score = similarity(key, foldKey(spelling));
            if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
              best = { place, score };
            }
          }
        }
        if (best) record(best.place, token.text, true);
      }
      consumed = 1;
    }
    index += consumed;
  }

  return matches;

  function record(place: Place, matchedText: string, fuzzy: boolean) {
    if (seen.has(place.name)) return;
    seen.add(place.name);
    matches.push({ name: place.name, district: place.district, fuzzy, matchedText });
  }
}

// Splits on everything that is not a Turkish letter or digit, and drops the
// apostrophe suffixes announcements attach to place names.
function tokenize(text: string): { text: string }[] {
  return stripApostropheSuffix(text)
    .split(/[^0-9A-Za-zÇĞİıÖŞÜçğöşü]+/)
    .filter(Boolean)
    .map((word) => ({ text: word }));
}

// Districts covered by a set of matched places. When an announcement spans
// districts the caller splits it into one record per district, so a reader
// filtering by district still sees it (§10.4).
export function districtsOf(matches: PlaceMatch[]): DistrictId[] {
  const ordered: DistrictId[] = [];
  for (const match of matches) {
    if (!ordered.includes(match.district)) ordered.push(match.district);
  }
  return ordered;
}
