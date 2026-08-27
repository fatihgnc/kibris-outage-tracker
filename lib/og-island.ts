import { getMapGeometry } from './geography';
import { LAMP_CORE, LAMP_GLOW, GLOW_STOPS } from './map-style';

// The map's palette, repeated as literals. Everywhere else the colours come
// from the custom properties in globals.css (§8), but a social card is
// rasterised outside any browser: no stylesheet, no cascade, no var().
const NIGHT = '#0b1220';
const LAMP = '#f5c86b';
const LAND = '#c9d1dc';

/**
 * The island, as a standalone SVG document for the Open Graph card.
 *
 * The card is not a live view: it is drawn with every lamp lit, the state the
 * site opens on and the one the metaphor rests on (§3.5). A preview cached by
 * a messaging app for a week must not claim Girne is dark.
 */
export function islandSvg(): string {
  const { viewBox, islandPath, districts, settlements } = getMapGeometry();
  const stops = GLOW_STOPS.map(
    ([offset, opacity]) =>
      `<stop offset="${offset * 100}%" stop-color="${LAMP}" stop-opacity="${opacity}"/>`,
  ).join('');

  const land = districts
    .map((d) => `<path d="${d.path}" fill="${LAND}" fill-opacity="0.1"/>`)
    .join('');

  const lamps = settlements
    .map(
      (s) =>
        `<circle cx="${s.x}" cy="${s.y}" r="${LAMP_GLOW}" fill="url(#lamp)"/>` +
        `<circle cx="${s.x}" cy="${s.y}" r="${LAMP_CORE}" fill="${LAMP}" fill-opacity="0.9"/>`,
    )
    .join('');

  // The left of the card carries the words, so the map is faded back into the
  // night before it reaches them. The fade lives here rather than as a layer
  // over the image because satori flattens a CSS gradient to its two end
  // stops, and a fade that starts at the left edge dims the text with it.
  const fade =
    `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0.40" stop-color="${NIGHT}" stop-opacity="1"/>` +
    `<stop offset="0.70" stop-color="${NIGHT}" stop-opacity="0"/>` +
    `</linearGradient>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
    `<defs><radialGradient id="lamp">${stops}</radialGradient>${fade}` +
    `<filter id="soften" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>` +
    `<rect x="-100%" y="-100%" width="300%" height="300%" fill="${NIGHT}"/>` +
    // The bloom off the coast into the water, as on the site: the island is
    // flat, only lit.
    `<path d="${islandPath}" fill="none" stroke="#7c8699" stroke-width="9" stroke-opacity="0.1" filter="url(#soften)"/>` +
    `<path d="${islandPath}" fill="${LAND}" fill-opacity="0.05"/>` +
    land +
    lamps +
    `<rect x="-100%" y="-100%" width="300%" height="300%" fill="url(#fade)"/>` +
    `</svg>`
  );
}

/**
 * The same SVG as a data URI. Satori draws no gradients and runs no filters of
 * its own, so the map goes in as an image and resvg rasterises it whole.
 */
export function islandDataUri(): string {
  return `data:image/svg+xml;base64,${Buffer.from(islandSvg(), 'utf8').toString('base64')}`;
}
