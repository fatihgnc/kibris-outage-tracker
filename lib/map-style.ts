// Numbers the map is drawn with. Kept apart from lib/geography.ts so the
// client component can read them without pulling the GeoJSON — and, through
// it, d3-geo — into the browser bundle.

/** The frame is one thousand units wide; its height comes from the island. */
export const MAP_WIDTH = 1000;

// The map runs the full width of the window (§3.7), so its height is whatever
// the island's aspect ratio makes it and there is no cap to state. It used to
// be capped at 480px against 52vh, which kept the outage list above the fold —
// but that put the island at 646 pixels on a 1280 pixel window, a village core
// at three quarters of a pixel, and the whole point of a lamp for every place
// out of reach. The list moved below the fold; the map became legible.

// One size for every place (§3.2). A lamp used to be drawn at one of three
// radii, scaled by a `weight` taken from what OpenStreetMap called the place —
// city, town, or anything smaller. It is gone.
//
// The map says one thing: whether the power is on here. How large a place is
// says nothing about that, and drawing it anyway put a thumb on the scale — a
// city's outage looked like the bigger event when the map has no way of knowing
// that it is. It also read as data the map does not hold: the weight came from
// a tag rather than from population, and 179 of the 192 places fell into the
// same bucket regardless.
export const LAMP_GLOW = 14;
export const LAMP_CORE = 1.6;

// What is left where a lamp has gone out (§3.3). A place under an outage is not
// gone from the island — it is dark, and it still has to be findable and
// hoverable. The glow and the amber core fade away and this cold dot takes
// their place.
//
// It is wider than the core it replaces, and deliberately so. What makes a lit
// point legible is the glow around it, and an unlit point has none; at the
// core's own radius — two pixels on a 1280 pixel window — the dot could not be
// seen at all, which is the bug this replaced: the place simply vanished.
export const UNLIT_DOT = 2.4;

/** The gradient the map paints, as numbers: offset to opacity. */
export const GLOW_STOPS: [number, number][] = [
  [0, 0.85],
  [0.16, 0.46],
  [0.38, 0.19],
  [0.66, 0.055],
  [1, 0],
];
