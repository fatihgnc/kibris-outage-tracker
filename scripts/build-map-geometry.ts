import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeMapGeometry } from '../lib/geo/build-layout';

// Projects the island and searches for where the six district names can be
// written, then writes the result next to the GeoJSON it came from. Runs from
// `npm run build:map`, and from `prebuild` so a release can never ship a layout
// older than its data. Nothing at request time repeats this work.
const target = join(process.cwd(), 'lib', 'geo', 'map-layout.json');
const started = Date.now();
const geometry = computeMapGeometry();
writeFileSync(target, `${JSON.stringify(geometry, null, 2)}\n`, 'utf8');

const worst = geometry.districts.reduce((a, b) => (a.lightUnder > b.lightUnder ? a : b));
console.log(
  `map-layout.json written in ${Date.now() - started}ms — ${geometry.viewBox}, ` +
    `${geometry.districts.length} districts, ${geometry.settlements.length} settlements, ` +
    `brightest label ${worst.label} at ${worst.lightUnder}`,
);
