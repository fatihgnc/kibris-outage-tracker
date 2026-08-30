import { EMBER_RING, GLOW_STOPS, LAMP_CORE, LAMP_GLOW, OUT_GLOW, UNLIT_DOT } from '@/lib/map-style';

/**
 * What the island is made of, in one sentence, above the island.
 *
 * The map draws a hundred and ninety-three points and names none of them
 * (§3.6), so what a point *is* has to be said somewhere — and the reader who
 * needs telling is the one arriving for the first time, before they have
 * hovered anything. The popover answers it too, but only after you already
 * guessed there was something to hover.
 *
 * The swatches are drawn rather than described: a colour named in words is a
 * lookup the reader has to perform against a map of two hundred dots, and
 * `--color-fault` has no name in Turkish or English that distinguishes it from
 * the amber next to it at this size. They are the same marks the map draws,
 * from the same constants, so the legend cannot drift away from the thing it
 * explains.
 */

// The swatch frame, in the map's own units, so a mark can be dropped in at the
// radius the map gives it and come out the right size.
const BOX = 22;
const HALF = BOX / 2;

function Swatch({
  id,
  colour,
  glow,
  core,
  ring,
}: {
  id: string;
  colour: string;
  glow: number;
  core: number;
  ring?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width="17"
      height="17"
      aria-hidden="true"
      className="inline-block shrink-0 translate-y-[2px]"
    >
      <defs>
        <radialGradient id={id}>
          {GLOW_STOPS.map(([offset, opacity]) => (
            <stop
              key={offset}
              offset={`${offset * 100}%`}
              stopColor={colour}
              stopOpacity={opacity * 0.9}
            />
          ))}
        </radialGradient>
      </defs>
      <circle cx={HALF} cy={HALF} r={glow} fill={`url(#${id})`} />
      <circle cx={HALF} cy={HALF} r={core} fill={colour} />
      {ring !== undefined && (
        <circle
          cx={HALF}
          cy={HALF}
          r={ring}
          fill="none"
          stroke={colour}
          strokeWidth={0.75}
          strokeOpacity={0.85}
        />
      )}
    </svg>
  );
}

export default function MapLegend({
  lead,
  powerOn,
  powerOut,
  backToday,
}: {
  lead: string;
  powerOn: string;
  powerOut: string;
  backToday: string;
}) {
  return (
    <p className="m-0 flex max-w-[70ch] flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-meta text-muted">
      <span>{lead}</span>
      {/* No middots between the three. Each already carries its own swatch,
        * which separates them on its own, and a separator that trails an item
        * ends up dangling at the end of a line when the row wraps — which it
        * does at 375px, where the third state drops to a line of its own. */}
      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-1.5">
          <Swatch id="legend-on" colour="var(--color-lamp)" glow={LAMP_GLOW * 0.62} core={LAMP_CORE} />
          {powerOn}
        </span>
        <span className="flex items-baseline gap-1.5">
          <Swatch id="legend-out" colour="var(--color-fault)" glow={OUT_GLOW} core={UNLIT_DOT} />
          {powerOut}
        </span>
        <span className="flex items-baseline gap-1.5">
          <Swatch
            id="legend-back"
            colour="var(--color-lamp)"
            glow={LAMP_GLOW * 0.62}
            core={LAMP_CORE}
            ring={EMBER_RING}
          />
          {backToday}
        </span>
      </span>
    </p>
  );
}
