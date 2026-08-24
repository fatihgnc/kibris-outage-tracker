// Numbers the map is drawn with. Kept apart from lib/geography.ts so the
// client component can read them without pulling the GeoJSON — and, through
// it, d3-geo — into the browser bundle. The label placement in
// lib/geo/build-layout.ts reads the same values, so what the search avoids is
// exactly what the map paints.

/** The frame is one thousand units wide; its height comes from the island. */
export const MAP_WIDTH = 1000;

/** §3.7: the map is capped so the outage list starts before the fold. */
export const MAX_MAP_HEIGHT = 480;

/** Font size of the six permanent district labels, in CSS pixels. */
export const LABEL_PX = 9;

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
export const GLOW_RADIUS = { 3: 60, 2: 43, 1: 28 } as const;
export const CORE_RADIUS = { 3: 2.8, 2: 2.1, 1: 1.5 } as const;
export const glowRadius = (weight: number) => GLOW_RADIUS[weight as 1 | 2 | 3] ?? GLOW_RADIUS[1];
export const coreRadius = (weight: number) => CORE_RADIUS[weight as 1 | 2 | 3] ?? CORE_RADIUS[1];

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
