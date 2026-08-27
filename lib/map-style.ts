// Numbers the map is drawn with. Kept apart from lib/geography.ts so the
// client component can read them without pulling the GeoJSON — and, through
// it, d3-geo — into the browser bundle. The label placement in
// lib/geo/build-layout.ts reads the same values, so what the search avoids is
// exactly what the map paints.

/** The frame is one thousand units wide; its height comes from the island. */
export const MAP_WIDTH = 1000;

// The map runs the full width of the window (§3.7), so its height is whatever
// the island's aspect ratio makes it and there is no cap to state. It used to
// be capped at 480px against 52vh, which kept the outage list above the fold —
// but that put the island at 646 pixels on a 1280 pixel window, a village core
// at three quarters of a pixel, and the whole point of a lamp for every place
// out of reach. The list moved below the fold; the map became legible.

// Font size of the six permanent district labels, in CSS pixels. They are HTML
// at a fixed size, so they do not grow with the frame — and once the frame grew
// to the width of the window, nine pixels read as an afterthought on it.
//
// Eleven and not more. The label placement search reserves room by this size
// measured against LABEL_REFERENCE_SCALE, so a larger label claims more ground
// and finds more light under it: at eleven every one of the six still lands
// inside LIGHT_LIMIT, with the brightest measuring 0.197. At twelve the search
// has to give the constraint up and GAZİMAĞUSA settles at 0.393.
export const LABEL_PX = 11;

// All six labels appear from this width up, where the column is narrowest and
// the frame therefore smallest. Sizing the placement maths for that worst case
// means a label that clears the coast here clears it everywhere; on a wide
// screen it simply has more room than it claimed.
//
// 768 rather than 640: GAZİMAĞUSA is the longest name and its district the
// narrowest strip, and at a 640px column the name cannot be written inside it
// with any real gap to the shore — measured best case 7px. At 768 it clears
// 14px. Below that width only districts under an outage are named, which is
// the rule either way; this only moves where it starts.
export const LABEL_BREAKPOINT = 768;

/** Minimum gap between a label and the coastline, in CSS pixels. */
export const LABEL_COAST_GAP = 14;

/** Frame units the label maths works in; see LABEL_BREAKPOINT. */
export const LABEL_REFERENCE_SCALE = (LABEL_BREAKPOINT - 40) / MAP_WIDTH;

// A lamp is a stain of light, not a dot: the radius scales with the weight the
// data carries, so a city spills further than a village.
//
// These were set when the map carried 26 lamps. It now carries one for every
// name the ingest can match — 192 — and light adds up: at the old radii the
// centre of the island was a single sheet of amber with no villages legible in
// it, and the dimmest place to write a district label measured 0.84 bright.
// Roughly halved, so the island reads as a scatter of lit places again.
export const GLOW_RADIUS = { 3: 34, 2: 22, 1: 12 } as const;
export const CORE_RADIUS = { 3: 2.6, 2: 1.9, 1: 1.2 } as const;
export const glowRadius = (weight: number) => GLOW_RADIUS[weight as 1 | 2 | 3] ?? GLOW_RADIUS[1];
export const coreRadius = (weight: number) => CORE_RADIUS[weight as 1 | 2 | 3] ?? CORE_RADIUS[1];

// What is left where a lamp has gone out (§3.3). A place under an outage is not
// gone from the island — it is dark, and it still has to be findable and
// hoverable. The glow and the amber core fade away and this cold dot takes
// their place.
//
// It is wider than the core it replaces, and deliberately so. What makes a lit
// point legible is the glow around it, and an unlit point has none; at the
// core's own radius — a pixel and a half on a 1280 pixel window — the dot could
// not be seen at all, which is the bug this replaced: the place simply
// vanished.
export const UNLIT_RADIUS = { 3: 3.4, 2: 2.8, 1: 2.2 } as const;
export const unlitRadius = (weight: number) => UNLIT_RADIUS[weight as 1 | 2 | 3] ?? UNLIT_RADIUS[1];

// The gradient the map paints, as numbers: offset to opacity. Label placement
// evaluates this rather than measuring to a lamp's centre — what buries a name
// is how bright the light is under it, and a centre says nothing about that on
// its own.
export const GLOW_STOPS: [number, number][] = [
  [0, 0.85],
  [0.16, 0.46],
  [0.38, 0.19],
  [0.66, 0.055],
  [1, 0],
];

export const glowOpacity = (t: number) => {
  if (t >= 1) return 0;
  for (let i = 1; i < GLOW_STOPS.length; i++) {
    const [x1, y1] = GLOW_STOPS[i];
    if (t <= x1) {
      const [x0, y0] = GLOW_STOPS[i - 1];
      return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
    }
  }
  return 0;
};
