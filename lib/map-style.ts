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

/**
 * The core is the filament, not a dot inside it.
 *
 * A bulb is not one flat colour: it is white where the wire is and amber by the
 * time the light is through the glass. The first attempt drew that as a smaller
 * hotter circle inside the core — and it was 0.7 units across, which on a
 * thousand-unit frame in a 1280 pixel window is *under one pixel*, at half
 * opacity. It was verified at fourteen times magnification and was invisible at
 * the only size anybody sees. There is no room for structure inside a two-pixel
 * lamp; the heat has to be the core's own colour or it is nothing.
 *
 * The bulb's shape is out of reach for a different reason: a glyph needs about
 * eight frame units to read as one, and the lamps sit ten apart at the median,
 * sixty-eight of a hundred and ninety-three closer than eight. Drawing the
 * shape would stack them.
 *
 * Not a seventh colour in the set (§2.1) so much as the top of the one that is
 * already there: the lamps composite with `screen`, the glow around this is
 * `--color-lamp`, and cream at the centre of amber is what amber looks like
 * where it is hottest. It appears nowhere else on the map.
 */
export const LAMP_CORE_FILL = '#fff3d6';

/**
 * A filament does not switch: it comes up fast, goes down slowly, and on the
 * way down the hot centre goes first while the halo lingers behind it.
 *
 * So the two directions are not the same length, and the core is not the same
 * length as the glow around it. That is the whole of the effect, and it gets
 * there without any part of the light turning red — §3.3 rules that out, and
 * rightly: a light that has gone out does not burn. Nothing changes hue at all.
 * The hot point simply stops first.
 */
export const LAMP_ON_MS = 240;
export const EXTINGUISH_MS = 700;
export const CORE_COOL_MS = 200;

// What is left where a lamp has gone out (§3.3). A place under an outage is not
// gone from the island — it is dark, and it still has to be findable and
// hoverable. The amber core is replaced by this one, and the light around it by
// OUT_GLOW below.
//
// Exactly the core's own size, and that equality is the point: every place is
// one point of the same size whether its power is on or off (§3.2). It was twice
// as wide for a while, for a reason that has since gone away — an unlit point
// had no glow at all back then, and what makes a lit one legible is the glow
// rather than the core, so the dot had to carry the whole of its own
// visibility. It no longer does. Drawn bigger now it just reads as a bigger
// place, which is the exact claim the one-size rule exists to refuse.
export const UNLIT_DOT = LAMP_CORE;

/**
 * The colour of a place with no power, and the ping it sends out.
 *
 * Red, and this reverses §3.3. The old rule was that an unlit point is unlit and
 * must not burn — the metaphor being a lamp that has gone out. What the metaphor
 * cost was the map's actual job: a grey dot two and a half units across, among a
 * hundred and ninety glowing lamps, was the hardest thing on the island to find,
 * and it is the only thing anybody opens the page to look for. A metaphor that
 * hides the subject is not worth keeping. The reading it is drawn for is the
 * reader's own: the power being off is the fault, whatever the announcement was
 * filed as.
 *
 * One thing this costs, and it is worth watching. Red already means `fault`
 * everywhere else on the site — it is what separates an arıza from planned work
 * on the badges and the time ranges — so a red point now sits under a planned
 * outage too, and the map no longer draws the distinction the cards draw. The
 * kind is still named in the popover and on every card.
 *
 * The movement does more of the finding than the colour does. At this density
 * nothing static competes with that much amber; a slow ping does, and most of
 * its cycle is spent at nothing, so several at once do not read as an alarm.
 */
export const PULSE_MAX = 13;
export const PULSE_MS = 2600;

/**
 * The bloom under a dark place.
 *
 * Every other mark on this map is a point with light coming off it — that is
 * the whole visual language, and the first red version did not speak it. A flat
 * disc with a hairline ring, hard-edged, in the middle of a field of soft
 * halos, read as something pasted onto the picture rather than something in it.
 *
 * So the dark places get a bloom of their own. Smaller and weaker than a lamp's,
 * because it is not light — nothing is being lit here — but enough that the mark
 * belongs to the same drawing. And it is painted normally rather than through
 * `screen`: added as light it would climb toward pink over the amber underneath
 * and stop being red at all.
 */
export const OUT_GLOW = 9;

// A place that went dark earlier today and has its power back. Drawn as a ring
// around the lit lamp rather than as a change to the light itself: the light is
// the live state and must keep meaning exactly one thing.
export const EMBER_RING = LAMP_CORE + 3.4;

// The ripple a lamp leaves when it goes out while the page is open. One shot,
// on the transition only — never on load, where it would fire for every place
// already dark and turn the opening into fireworks.
export const RIPPLE_MAX = 26;
export const RIPPLE_MS = 1400;

// How far the pointer's own lamp swells, and how far the hairline runs from it
// towards the popover.
export const HOVER_SWELL = 1.5;
export const LEADER_LENGTH = 20;

/** The gradient the map paints, as numbers: offset to opacity. */
export const GLOW_STOPS: [number, number][] = [
  [0, 0.85],
  [0.16, 0.46],
  [0.38, 0.19],
  [0.66, 0.055],
  [1, 0],
];
