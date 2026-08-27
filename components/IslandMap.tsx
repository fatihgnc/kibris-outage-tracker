'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fill as fillTemplate } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import type { MapDistrict, MapSettlement } from '@/lib/geography';
import { LABEL_PX, MAX_MAP_HEIGHT, coreRadius, glowRadius, unlitRadius } from '@/lib/map-style';

/**
 * What the popover says about a lamp that is out. Already worded and already
 * formatted: the locale, the clock and the dictionary all live on the server,
 * and none of them need to be shipped here to render a line of text.
 */
export type LampOutage = {
  kind: string;
  when: string;
  source: string;
};

export type Props = {
  viewBox: string;
  width: number;
  height: number;
  islandPath: string;
  districts: MapDistrict[];
  settlements: MapSettlement[];
  outages: Record<string, LampOutage>;
  locale: Locale;
  strings: {
    ariaLabel: string;
    hint: string;
    powerOn: string;
    powerOut: string;
    pointAria: string; // {name} {status} {district}
    districtAria: string; // {district}
  };
};

// The island is lit place by place, so a name written on it always has light
// under it somewhere. Where placement cannot get out of the way, the name gets
// a soft plate of night behind it: blurred, no edge, no box, and invisible
// where there is nothing bright to sit on. Strength follows the measured light.
const readabilityPlate = (light: number) => {
  const layers = light > 0.45 ? 5 : light > 0.25 ? 3 : 2;
  return Array.from({ length: layers }, (_, i) => `0 0 ${3 + i * 3}px var(--color-night)`).join(', ');
};

// §3.5, the one orchestrated moment on the site: the lamps come up west to
// east over ~900ms, then anything under an outage fades back out over 400ms.
const IGNITE_SPAN = 900;
const IGNITE_STEP = 320;
const EXTINGUISH_AT = IGNITE_SPAN + 60;
const SETTLED_AT = EXTINGUISH_AT + 500;

// How near the pointer has to be, in frame units, before a lamp claims it.
// This used to be a fraction of the glow, which worked when a lamp was one of
// twenty-six and spilled sixty units. At the density the map carries now the
// glow is twelve units for a village, and tying the target to it would mean
// hunting for a four-unit dot; the lamps sit further apart than this anyway, so
// nearest-wins settles the rest.
const HOVER_RADIUS = 14;

export default function IslandMap({
  viewBox,
  width,
  height,
  islandPath,
  districts,
  settlements,
  outages,
  locale,
  strings,
}: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<MapSettlement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const districtName = useMemo(
    () => new Map(districts.map((d) => [d.id, d.name])),
    [districts],
  );

  // Once the opening sequence has played, the lamps are driven by a plain
  // transition instead: a data refresh should ease, not replay the overture.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLED_AT);
    return () => clearTimeout(timer);
  }, []);

  // The order is longitude, straight from the coordinates — the settlements
  // arrive from lib/geography already sorted west to east.
  const step = IGNITE_SPAN / Math.max(settlements.length - 1, 1);

  const open = (district: string) => router.push(`/${locale}/district/${district}`);
  const statusOf = (name: string) => (outages[name] ? strings.powerOut : strings.powerOn);

  // Settlement names are never written on the map; they surface in the popover
  // when the pointer is over one, and on the line under it either way.
  const showNearestSettlement = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const { x, y } = point.matrixTransform(matrix.inverse());
    let nearest: MapSettlement | null = null;
    let best = Infinity;
    for (const s of settlements) {
      const distance = Math.hypot(s.x - x, s.y - y);
      if (distance < best) {
        best = distance;
        nearest = s;
      }
    }
    setActive(nearest && best <= HOVER_RADIUS ? nearest : null);
  };

  // Largest first, so the smallest district's hit area is never buried under a
  // neighbour's.
  const byHitOrder = [...districts].sort((a, b) => b.area - a.area);

  const activeOutage = active ? outages[active.name] : undefined;
  const readout = active
    ? fillTemplate(strings.pointAria, {
        name: active.name,
        status: statusOf(active.name),
        district: districtName.get(active.district) ?? active.district,
      })
    : null;

  return (
    <div>
      {/* The frame carries the aspect ratio so the labels can be positioned in
       * percentages of it. The cap is expressed as a max *width* derived from
       * the height limit: capping the height directly would leave the <svg>
       * letterboxed inside a full-width box, and the sea cannot reach a
       * letterbox. The vh term pulls the map back on a short window so the
       * outage list still starts in view. */}
      <div
        className="relative mx-auto w-full"
        style={{
          aspectRatio: `${width} / ${height}`,
          maxWidth: `calc(min(${MAX_MAP_HEIGHT}px, 52vh) * ${(width / height).toFixed(4)})`,
        }}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          role="group"
          aria-label={strings.ariaLabel}
          className="block h-full w-full bg-night"
        >
          <defs>
            {/* The one gradient on the site (§3): the map's light is the
             * metaphor. objectBoundingBox units, so a single definition serves
             * every radius. */}
            <radialGradient id="map-lamp">
              <stop offset="0%" stopColor="var(--color-lamp)" stopOpacity={0.85} />
              <stop offset="16%" stopColor="var(--color-lamp)" stopOpacity={0.46} />
              <stop offset="38%" stopColor="var(--color-lamp)" stopOpacity={0.19} />
              <stop offset="66%" stopColor="var(--color-lamp)" stopOpacity={0.055} />
              <stop offset="100%" stopColor="var(--color-lamp)" stopOpacity={0} />
            </radialGradient>
            <filter id="map-soften" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation={3.5} />
            </filter>
            <clipPath id="map-island-clip">
              <path d={islandPath} />
            </clipPath>
          </defs>

          {/* 1 — the sea, drawn well past the frame so no edge can band */}
          <rect x="-100%" y="-100%" width="300%" height="300%" fill="var(--color-night)" />

          {/* Depth: a faint bloom off the coast into the water. No perspective,
           * no 3D — the island is flat, only lit. */}
          <path
            d={islandPath}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={9}
            strokeOpacity={0.1}
            filter="url(#map-soften)"
          />

          {/* 2/3 — the island body. The south carries only this step and no
           * district on top, so it stays well behind the north: visible land,
           * plainly not the subject. */}
          <path d={islandPath} fill="var(--color-text)" fillOpacity={0.05} />

          {/* 4 — districts, a clear step brighter than the south. They are the
           * ground the light sits on and the thing a reader clicks; they carry
           * no outage state of their own. An outage is a place going dark, and
           * a district is not a place — shading the whole of one said a village
           * was out when only a neighbouring village was. */}
          {districts.map((d) => (
            <path key={d.id} d={d.path} fill="var(--color-text)" fillOpacity={0.1} />
          ))}

          {/* Depth: a soft inner shadow along the coast, so the island reads as
           * a surface carved out of the water. */}
          <g clipPath="url(#map-island-clip)">
            <path
              d={islandPath}
              fill="none"
              stroke="var(--color-night)"
              strokeWidth={8}
              strokeOpacity={0.5}
              filter="url(#map-soften)"
            />
          </g>

          {/* 5 — the light, and the whole of the map's data. One lamp per name
           * the ingest can match. Overlapping lamps add up, so the dense middle
           * of the island glows on its own. Isolated so the blend stays inside
           * the map, and clipped to the island rather than to each district:
           * light does not stop at an administrative line. */}
          <g style={{ isolation: 'isolate' }} clipPath="url(#map-island-clip)">
            {settlements.map((s, i) => {
              const out = Boolean(outages[s.name]);
              const ignite = `ignite ${IGNITE_STEP}ms ease-out ${Math.round(i * step)}ms both`;
              return (
                <g
                  key={s.name}
                  className="map-anim"
                  transform={`translate(${s.x} ${s.y})`}
                  style={{
                    mixBlendMode: 'screen',
                    // The base opacity is the finished state, so a reader with
                    // reduced motion — where globals.css drops the animation
                    // and the transition both — simply sees the result.
                    opacity: out ? 0 : 1,
                    ...(settled
                      ? { transition: 'opacity 400ms ease' }
                      : {
                          animation: out
                            ? `${ignite}, extinguish 400ms ease-in ${EXTINGUISH_AT}ms forwards`
                            : ignite,
                        }),
                  }}
                >
                  <circle className="map-glow" r={glowRadius(s.weight)} fill="url(#map-lamp)" />
                  <circle r={coreRadius(s.weight)} fill="var(--color-lamp)" />
                </g>
              );
            })}
          </g>

          {/* What is left where a lamp has gone out. A place under an outage is
           * still a place: it has to stay findable, and hoverable, or the
           * reader loses the village they were looking for at the moment it
           * matters. The light goes; the point stays, cold.
           *
           * Outside the blend group above on purpose. Those lamps are composited
           * with `screen`, which can only ever add light — a dark dot drawn
           * inside it would be invisible by definition. This layer paints
           * normally, so it can be darker than the ground it sits on.
           *
           * Every settlement is drawn, not only the dark ones, so that a lamp
           * going out on a data refresh crossfades with the point taking its
           * place instead of one popping in after the other. */}
          <g clipPath="url(#map-island-clip)">
            {settlements.map((s) => {
              const out = Boolean(outages[s.name]);
              return (
                <circle
                  key={s.name}
                  className="map-anim"
                  cx={s.x}
                  cy={s.y}
                  r={unlitRadius(s.weight)}
                  fill="var(--color-muted)"
                  // The tone is carried by fill-opacity rather than opacity so
                  // that `ignite` — which runs 0 to 1 — can drive the fade
                  // without having to overshoot it. The two multiply.
                  fillOpacity={0.5}
                  style={{
                    opacity: out ? 1 : 0,
                    ...(settled
                      ? { transition: 'opacity 400ms ease' }
                      : // Mirrors the lamp's own fade: it arrives exactly as the
                        // light leaves, and `both` holds it hidden through the
                        // ignition before that.
                        { animation: out ? `ignite 400ms ease-in ${EXTINGUISH_AT}ms both` : 'none' }),
                  }}
                />
              );
            })}
          </g>

          {/* A lamp the pointer is on gets a ring rather than more light: the
           * light is the data, and brightening it under the cursor would say
           * the power had come back. */}
          {active && (
            <circle
              cx={active.x}
              cy={active.y}
              r={coreRadius(active.weight) + 4}
              fill="none"
              stroke={activeOutage ? 'var(--color-muted)' : 'var(--color-lamp)'}
              strokeWidth={0.8}
              strokeOpacity={0.9}
              className="pointer-events-none"
            />
          )}

          {/* 6 — district hairlines, thinner than the coast */}
          {districts.map((d) => (
            <path
              key={d.id}
              d={d.path}
              fill="none"
              stroke={hovered === d.id ? 'var(--color-lamp)' : 'var(--color-dark)'}
              strokeWidth={hovered === d.id ? 1 : 0.6}
            />
          ))}

          {/* 7 — the coastline: thin, but it has to be readable */}
          <path
            d={islandPath}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />

          {/* 9 — the interaction layer. The click target is the district, not
           * the point: a lamp is two units across, and there are a hundred and
           * ninety of them. Hovering reads a place; clicking opens a district.
           * A real <a> rather than a path with role="link": a focusable path
           * lands in document.activeElement but never fires a focus event, so
           * keyboard users would get no hover state and no readout. The click
           * is intercepted for client-side routing; Enter goes through it. */}
          {byHitOrder.map((d) => (
            <a
              key={d.id}
              href={`/${locale}/district/${d.id}`}
              tabIndex={0}
              aria-label={fillTemplate(strings.districtAria, { district: d.name })}
              onClick={(e) => {
                e.preventDefault();
                open(d.id);
              }}
              // Chrome does not synthesise a click from Enter on an SVG
              // anchor, so the keyboard path is wired explicitly. Verified by
              // tabbing to a district and pressing Enter.
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open(d.id);
                }
              }}
              onMouseEnter={() => setHovered(d.id)}
              onMouseMove={showNearestSettlement}
              onMouseLeave={() => {
                setHovered(null);
                setActive(null);
              }}
              onFocus={() => setHovered(d.id)}
              onBlur={() => setHovered(null)}
            >
              <path className="map-hit" d={d.path} fill="transparent" />
            </a>
          ))}
        </svg>

        {/* 8 — the six district names, drawn as HTML over the map. In the SVG
         * they would scale with the frame and fall to five pixels on a phone;
         * here they keep their size. Settlement names stay off the map — there
         * are a hundred and ninety of them, and only these six are what orients
         * a reader. On a narrow screen even these give way; the breakpoint is
         * LABEL_BREAKPOINT, the width the placement maths is sized for. */}
        {districts.map((d) => (
          <span
            key={d.id}
            style={{
              left: `${d.labelX * 100}%`,
              top: `${d.labelY * 100}%`,
              fontSize: LABEL_PX,
              textShadow: readabilityPlate(d.lightUnder),
            }}
            className="pointer-events-none absolute hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono leading-none tracking-[0.14em] text-muted md:block"
          >
            {d.label}
          </span>
        ))}

        {/* The popover. It is the only place a settlement name appears on the
         * map, so it has to answer the whole question at once: where this is,
         * whether the power is on, and — if it is not — what kind of outage,
         * until when, and who said so.
         *
         * Never interactive. It opens on hover and would take the pointer with
         * it, so a link inside it could not be reached; the source is named in
         * plain text and the list under the map carries the link. */}
        {active && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[15rem]"
            style={{
              left: `${Math.min(Math.max(active.x / width, 0.12), 0.88) * 100}%`,
              top: `${(active.y / height) * 100}%`,
              // Above the lamp, unless the lamp is near the top of the frame —
              // Girne and the panhandle sit within a popover's height of it.
              transform:
                active.y / height < 0.28
                  ? 'translate(-50%, 1rem)'
                  : 'translate(-50%, calc(-100% - 0.75rem))',
            }}
          >
            <div className="border border-dark bg-night/95 px-2 py-1.5 font-mono text-meta leading-snug">
              <p className="m-0 text-text">{active.name}</p>
              <p className={`m-0 ${activeOutage ? 'text-lamp' : 'text-muted'}`}>
                {statusOf(active.name)}
              </p>
              {activeOutage && (
                <>
                  <p className="m-0 mt-1 text-muted">
                    {activeOutage.kind} · {activeOutage.when}
                  </p>
                  {activeOutage.source && (
                    <p className="m-0 text-muted opacity-70">{activeOutage.source}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <p aria-live="polite" className="m-0 min-h-[18px] pt-1 font-mono text-meta text-muted">
        {readout ?? strings.hint}
      </p>
    </div>
  );
}
