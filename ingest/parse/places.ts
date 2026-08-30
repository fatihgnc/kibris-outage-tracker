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

// A settlement is a proper noun and announcements write it that way, in title
// case or in full caps. Several village names are also ordinary Turkish words,
// and matching those without regard to case invents outages: "Vadili ağıllar"
// — the sheepfolds at Vadili, in Gazimağusa — was read as the village Ağıllar
// in İskele, and the announcement was split into a second record for a place
// it never mentioned. Requiring the capital costs a village written in lower
// case mid-sentence, which then goes to review; that is the cheaper mistake.
const startsUpperTr = (word: string) => /^[A-ZÇĞİÖŞÜ]/.test(word);

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
      if (!startsUpperTr(slice[0].text)) continue;
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
      if (key.length >= MIN_FUZZY_LENGTH && startsUpperTr(token.text)) {
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

/**
 * The same, for the list of names the model returns rather than a single string.
 *
 * The caller used to join the list with commas and hand that to `matchPlaces`.
 * The tokenizer strips punctuation, so the commas vanished and the element
 * boundaries with them — and `data/places.json` holds an alias spelled
 * `'Boğaz Girne'`, there to tell Girne's Boğaz from İskele's. So
 * `['Boğaz', 'Girne']` matched that alias across the boundary and came back as
 * one place: the Girne lamp stayed lit, and because the id is fingerprinted over
 * `areas`, the same announcement written in the other order produced a second
 * record with a different id.
 *
 * Joining still has to happen, though — the model splits one name across two
 * elements often enough that `['Küçük', 'Kaymaklı']` is a real case, and matched
 * apart it yields Kaymaklı, a different village two kilometres away. That is the
 * worse error: a wrong place rather than a missing one.
 *
 * So join only where it is needed. Of the 34 two-word spellings in
 * `data/places.json`, exactly one — `Boğaz Girne` — has both halves matching a
 * place on their own; in all 33 others one half matches nothing, which is what
 * makes the join necessary there and unnecessary here. An element that matched
 * something needs no help from its neighbour. `places.test.ts` asserts that
 * count, so adding a name that breaks the rule fails loudly rather than quietly
 * bringing the old bug back.
 */
export function matchAreas(areas: readonly string[]): PlaceMatch[] {
  const solo = areas.map((area) => matchPlaces(area));
  const joined = new Map<number, PlaceMatch[]>();

  for (let i = 0; i < areas.length; i++) {
    if (solo[i].length > 0) continue;
    // Left first, then right: an announcement writing a name in two pieces puts
    // the qualifier before the noun ('Küçük Kaymaklı', 'Aşağı Bostancı'), so the
    // empty element is usually the earlier one and its partner the later.
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= areas.length) continue;
      const pair = i < j ? `${areas[i]} ${areas[j]}` : `${areas[j]} ${areas[i]}`;
      const matched = matchPlaces(pair);
      // Only a match that needed both halves is worth taking; one that the
      // neighbour already found on its own tells us nothing new.
      if (matched.length === 0) continue;
      if (matched.every((m) => solo[j].some((s) => s.name === m.name))) continue;
      joined.set(i, matched);
      joined.set(j, []);
      break;
    }
  }

  const out: PlaceMatch[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < areas.length; i++) {
    for (const match of joined.get(i) ?? solo[i]) {
      if (seen.has(match.name)) continue;
      seen.add(match.name);
      out.push(match);
    }
  }
  return out;
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
