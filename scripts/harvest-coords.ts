// Maintenance tool for lib/geo/settlements.json — the lamps the map is drawn
// with (SPEC §3.5, §10.4).
//
// data/places.json is the canonical list the ingest matches announcements
// against; it carries no geometry. This script gives every one of its entries a
// coordinate by looking the name up in OpenStreetMap, so a village named in an
// outage can actually go dark on the map instead of taking its whole district
// with it.
//
// Run by hand, output reviewed and committed. Nothing here runs at build or
// request time — the app only ever reads the JSON this writes.
//
//   npm run harvest:coords
//
// Names OSM does not know, and names whose coordinate falls in the wrong
// district, are reported rather than guessed. Those are filled in by hand.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldKey } from '../ingest/parse/text';
import type { DistrictId, Settlement } from '../lib/types';
import { DISTRICTS } from '../lib/districts';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

type Place = { name: string; district: DistrictId; aliases: string[] };
const places = (JSON.parse(readFileSync(root('data/places.json'), 'utf8')) as { places: Place[] })
  .places;

// Names OpenStreetMap cannot place, sourced by hand and merged over the query
// result so a re-run never loses them. See the file's own $comment.
type Overrides = {
  placed: { name: string; lat: number; lng: number; note: string }[];
  unplaceable: { name: string; note: string }[];
};
const overrides = JSON.parse(
  readFileSync(root('lib/geo/settlements.overrides.json'), 'utf8'),
) as Overrides;

const geo = JSON.parse(readFileSync(root('lib/geo/cyprus.geo.json'), 'utf8')) as GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  { id: string }
>;
const shape = (id: string) => {
  const found = geo.features.find((f) => f.properties.id === id);
  if (!found) throw new Error(`cyprus.geo.json is missing the "${id}" feature`);
  return found.geometry.coordinates;
};

// How far a coordinate is from a shape, in kilometres, and zero inside it.
//
// A plain inside/outside test cannot be the gate here: cyprus.geo.json is the
// shape the map is *drawn* with, not an administrative record. It is simplified
// enough that Girne's own OSM node — the harbour — falls outside both the Girne
// polygon and the coastline, and its internal borders follow the drawing rather
// than the district lines places.json was checked against by hand. Measuring
// instead lets a coastal village sit a few hundred metres off the line while a
// namesake village in the south, tens of kilometres away, is still thrown out.
//
// Cyprus spans a third of a degree of latitude, so a plane with longitude
// scaled by cos(lat) is accurate to well under the tolerances used here.
const KM_PER_DEG = 111.32;
const LON_SCALE = Math.cos((35.2 * Math.PI) / 180);
const flat = ([lon, lat]: number[]): [number, number] => [lon * LON_SCALE, lat];

function distanceKm(rings: number[][][], point: [number, number]): number {
  const [px, py] = flat(point);
  let inside = false;
  let nearest = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = flat(ring[i]);
      const [bx, by] = flat(ring[j]);
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      nearest = Math.min(nearest, ex * ex + ey * ey);
    }
  }
  return inside ? 0 : Math.sqrt(nearest) * KM_PER_DEG;
}

// Far enough to forgive a simplified coastline, near enough that a same-named
// village in the south — the nearest is Vadili's namesake, 40km off — is never
// mistaken for one of ours.
const SERVICE_AREA_TOLERANCE_KM = 4;
// Only a warning. Announcements are filed by district, so a lamp landing in a
// neighbouring polygon is worth a look, but the polygon is not the authority.
const DISTRICT_REPORT_KM = 6;
const north = shape('north');

// The whole island plus a margin. Querying the north alone would miss villages
// whose OSM node sits a hair outside our own coastline; the district test below
// is what actually decides, so the query only has to be generous.
const BBOX = '34.5,32.2,35.8,34.7';

// `quarter` and `neighbourhood` are in because a good part of places.json is
// Lefkoşa and Gazimağusa neighbourhoods, not villages.
const PLACE_KINDS = 'city|town|village|suburb|hamlet|neighbourhood|quarter|isolated_dwelling';

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// How good a claim a node has to a name it shares with another node. Only 7 of
// the 194 names need this at all; the rest match exactly one place in the north.
//
// The district polygon used to decide, and it is the wrong authority:
// cyprus.geo.json is the shape the map is drawn with, and its Girne reaches
// east over Değirmenlik while stopping short of the Koruçam peninsula. That
// handed Tepebaşı to a neighbourhood outside Değirmenlik instead of the village
// west of Girne that OSM tags "name:tr=Tepebaşı".
//
// The data answers it better than the geometry does. A settlement in its own
// right outranks a quarter of a larger one, and a node OSM has bothered to give
// a Turkish name to is a node someone has identified as this place — which is
// exactly the claim being weighed. Checked by hand against all 7: this picks
// what a person would, and the polygon only breaks what is still a tie.
const SETTLEMENT_KINDS = new Set(['city', 'town', 'village']);
const claim = (tags: Record<string, string>) =>
  (tags['name:tr'] ? 2 : 0) + (SETTLEMENT_KINDS.has(tags.place) ? 1 : 0);

type OsmNode = { lat: number; lon: number; tags: Record<string, string> };

async function fetchNodes(): Promise<OsmNode[]> {
  const query = `[out:json][timeout:180];node["place"~"^(${PLACE_KINDS})$"](${BBOX});out body;`;
  let lastError: unknown = null;
  for (const endpoint of OVERPASS) {
    try {
      process.stderr.write(`querying ${new URL(endpoint).host}…\n`);
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'user-agent': 'kibris-kesinti-tracker/harvest-coords (one-off, manual)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = (await response.json()) as { elements: OsmNode[] };
      return parsed.elements.filter((e) => e.tags?.name);
    } catch (error) {
      lastError = error;
      process.stderr.write(`  failed: ${String(error)}\n`);
    }
  }
  throw new Error(`every Overpass endpoint failed; last: ${String(lastError)}`);
}

async function main() {
  const nodes = await fetchNodes();
  process.stderr.write(`${nodes.length} place node(s) in the bounding box\n\n`);

  // One folded key may be held by several nodes — 'Karaağaç' exists in more
  // than one district, and the same village is often tagged twice under
  // slightly different names. Keep them all and let the district decide.
  const byKey = new Map<string, OsmNode[]>();
  for (const node of nodes) {
    const spellings = ['name', 'name:tr', 'alt_name', 'int_name', 'official_name']
      .flatMap((tag) => (node.tags[tag] ?? '').split(';'))
      .map((s) => s.trim())
      .filter(Boolean);
    for (const key of new Set(spellings.map(foldKey))) {
      if (!key) continue;
      const list = byKey.get(key) ?? [];
      list.push(node);
      byKey.set(key, list);
    }
  }

  const settlements: Settlement[] = [];
  const missing: string[] = [];
  const offDistrict: string[] = [];
  const contested: string[] = [];
  const rejected: string[] = [];

  const overrideByName = new Map(overrides.placed.map((o) => [o.name, o]));
  const unplaceable = new Set(overrides.unplaceable.map((o) => o.name));

  for (const place of places) {
    // The hand-sourced coordinate wins outright. Several of these exist because
    // the query picks the *wrong* node, not because it picks none, so this has
    // to run before the search rather than as a fallback after it.
    const override = overrideByName.get(place.name);
    if (override) {
      settlements.push({
        name: place.name,
        lat: override.lat,
        lng: override.lng,
        district: place.district,
      });
      continue;
    }
    if (unplaceable.has(place.name)) continue;

    const home = shape(place.district);
    const seen = new Set<OsmNode>();
    // The canonical spelling is tried first; aliases only rescue what it
    // misses, so a historical Greek name never outranks the Turkish one.
    const candidates: OsmNode[] = [];
    for (const spelling of [place.name, ...place.aliases]) {
      for (const node of byKey.get(foldKey(spelling)) ?? []) {
        if (seen.has(node)) continue;
        seen.add(node);
        candidates.push(node);
      }
    }

    if (candidates.length === 0) {
      missing.push(`${place.name} (${place.district})`);
      continue;
    }

    // The south is inside the bounding box and shares a great many names with
    // the north, so a coordinate outside the service area is somebody else's
    // village and never ours. This is the only hard rejection.
    const served = candidates.filter(
      (n) => distanceKm(north, [n.lon, n.lat]) <= SERVICE_AREA_TOLERANCE_KM,
    );
    if (served.length === 0) {
      const where = candidates.map((n) => `${n.tags.name} @ ${n.lat},${n.lon}`).join('; ');
      rejected.push(`${place.name} (${place.district}) — only found outside the north: ${where}`);
      continue;
    }

    // Where a name is held by more than one node in the north, the stronger
    // claim to it wins; only where two nodes claim it equally does the district
    // places.json assigns break the tie, by proximity to that polygon.
    const scored = served.map((n) => ({
      node: n,
      away: distanceKm(home, [n.lon, n.lat]),
      rank: claim(n.tags),
    }));
    const best = scored.reduce((a, b) =>
      b.rank > a.rank || (b.rank === a.rank && b.away < a.away) ? b : a,
    );
    // Every name a judgement had to be made about is reported, win or lose.
    // These are the only entries in the file that could be the wrong village
    // rather than a slightly wrong position, so they are the ones worth a
    // person's eyes. Nodes within a kilometre of each other are one place
    // tagged twice, not a choice between two places.
    const rivals = scored.filter(
      (o) =>
        Math.hypot((o.node.lon - best.node.lon) * LON_SCALE, o.node.lat - best.node.lat) * KM_PER_DEG >
        1,
    );
    if (rivals.length > 0) {
      const runnerUp = rivals.reduce((a, b) =>
        b.rank > a.rank || (b.rank === a.rank && b.away < a.away) ? b : a,
      );
      contested.push(
        `${place.name} (${place.district}): took ${best.node.tags.place}` +
          `${best.node.tags['name:tr'] ? ' with name:tr' : ''} @ ${best.node.lat.toFixed(4)},${best.node.lon.toFixed(4)}` +
          ` over ${runnerUp.node.tags.place}${runnerUp.node.tags['name:tr'] ? ' with name:tr' : ''}` +
          ` @ ${runnerUp.node.lat.toFixed(4)},${runnerUp.node.lon.toFixed(4)}`,
      );
    }
    if (best.away > DISTRICT_REPORT_KM) {
      offDistrict.push(
        `${place.name} — filed under ${place.district}, but ${best.away.toFixed(1)}km outside it @ ${best.node.lat},${best.node.lon}`,
      );
    }
    settlements.push({
      name: place.name,
      lat: Math.round(best.node.lat * 1e4) / 1e4,
      lng: Math.round(best.node.lon * 1e4) / 1e4,
      district: place.district,
    });
  }

  settlements.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  writeFileSync(root('lib/geo/settlements.json'), `${JSON.stringify(settlements, null, 2)}\n`);

  const byDistrict = new Map<DistrictId, number>();
  for (const s of settlements) byDistrict.set(s.district, (byDistrict.get(s.district) ?? 0) + 1);

  console.log(
    `placed ${settlements.length} of ${places.length} place(s) — ` +
      `${overrides.placed.length} by hand, ${overrides.unplaceable.length} declared unplaceable\n`,
  );
  for (const [id, n] of [...byDistrict].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${DISTRICTS[id].name.padEnd(12)} ${n}`);
  }
  if (contested.length > 0) {
    console.log(
      String.fromCharCode(10) +
        `${contested.length} name(s) are held by more than one place — these are the only` +
        ` entries that could be the wrong village, so read them:`,
    );
    for (const line of contested) console.log(`  ${line}`);
  }
  if (offDistrict.length > 0) {
    console.log(`\n${offDistrict.length} lamp(s) sit well outside their own district — eyeball these:`);
    for (const line of offDistrict) console.log(`  ${line}`);
  }
  if (rejected.length > 0) {
    console.log(`\n${rejected.length} name(s) matched only outside the service area:`);
    for (const line of rejected) console.log(`  ${line}`);
  }
  if (missing.length > 0) {
    console.log(
      `\n${missing.length} name(s) OSM does not know — add them to settlements.overrides.json:`,
    );
    for (const line of missing) console.log(`  ${line}`);
  }
}
main();
