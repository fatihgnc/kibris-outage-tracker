'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fill as fillTemplate } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import {
  LABEL_PX,
  MAX_MAP_HEIGHT,
  coreRadius,
  glowRadius,
  type MapDistrict,
  type MapSettlement,
} from '@/lib/geography';

export type Props = {
  viewBox: string;
  width: number;
  height: number;
  islandPath: string;
  districts: MapDistrict[];
  settlements: MapSettlement[];
  darkDistricts: string[];
  darkSettlements: string[];
  locale: Locale;
  strings: {
    ariaLabel: string;
    hint: string;
    powerOn: string;
    powerOut: string;
    districtAria: string; // {district} {status}
  };
};

// The north is lit everywhere a district is, so there is nowhere inside some
// districts to put a name that is clear of the light — Lefke is three lamps in
// a small polygon. Where placement cannot get out of the way, the name gets a
// soft plate of night behind it: blurred, no edge, no box, and invisible where
// there is nothing bright to sit on. Strength follows the measured light.
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

export default function IslandMap({
  viewBox,
  width,
  height,
  islandPath,
  districts,
  settlements,
  darkDistricts,
  darkSettlements,
  locale,
  strings,
}: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const districtIsDark = useMemo(() => new Set(darkDistricts), [darkDistricts]);
  const settlementIsDark = useMemo(() => new Set(darkSettlements), [darkSettlements]);

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
  const statusOf = (district: string) =>
    districtIsDark.has(district) ? strings.powerOut : strings.powerOn;

  // Settlement names are never written on the map; they surface here, on the
  // line under it, when the pointer is over one. Typed by what it reads rather
  // than by element: JSX types <a> as an HTML anchor even inside an <svg>,
  // where React creates it in the SVG namespace.
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
    if (nearest && best <= glowRadius(nearest.weight) * 0.7) {
      const status = settlementIsDark.has(nearest.name) ? strings.powerOut : strings.powerOn;
      setHint(`${nearest.name} — ${status}`);
    } else {
      setHint(null);
    }
  };

  // Largest first, so the smallest district's hit area is never buried under a
  // neighbour's.
  const byHitOrder = [...districts].sort((a, b) => b.area - a.area);

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
            {/* An outage is a place going dark, not a rectangle laid over one.
             * The hollow is painted through a blurred mask of the district, so
             * its edge falls away instead of stopping at the administrative
             * line. */}
            <filter id="map-out-soften" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={9} />
            </filter>
            {districts
              .filter((d) => districtIsDark.has(d.id))
              .map((d) => (
                <mask
                  key={d.id}
                  id={`map-out-${d.id}`}
                  maskUnits="userSpaceOnUse"
                  x={-500}
                  y={-500}
                  width={2000}
                  height={2000}
                >
                  <path d={d.path} fill="#fff" filter="url(#map-out-soften)" />
                </mask>
              ))}
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

          {/* 4 — districts, a clear step brighter than the south */}
          {districts.map((d) => (
            <path key={d.id} d={d.path} fill="var(--color-text)" fillOpacity={0.1} />
          ))}

          {/* A district under an outage goes the other way — darker than the
           * land around it, a hollow rather than an alarm, and never red.
           * Clipped to the island so the softened edge cannot reach the
           * water. */}
          <g clipPath="url(#map-island-clip)">
            {districts
              .filter((d) => districtIsDark.has(d.id))
              .map((d) => (
                <rect
                  key={d.id}
                  x={-500}
                  y={-500}
                  width={2000}
                  height={2000}
                  fill="var(--color-night)"
                  fillOpacity={0.6}
                  mask={`url(#map-out-${d.id})`}
                />
              ))}
          </g>

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

          {/* 5 — the light. Overlapping lamps add up, so the dense middle of
           * the island glows on its own. Isolated so the blend stays inside the
           * map, and clipped to the island rather than to each district: light
           * does not stop at an administrative line, and clipping it there left
           * a visible cut across every internal border. */}
          <g style={{ isolation: 'isolate' }} clipPath="url(#map-island-clip)">
            {settlements.map((s, i) => {
              const out = settlementIsDark.has(s.name);
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

          {/* 6 — district hairlines, thinner than the coast */}
          {districts.map((d) => (
            <path
              key={d.id}
              d={d.path}
              fill="none"
              stroke={hovered === d.id ? 'var(--color-lamp)' : 'var(--color-dark)'}
              strokeWidth={hovered === d.id || districtIsDark.has(d.id) ? 1 : 0.6}
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

          {/* 9 — the interaction layer. The target is the district, not the
           * point: a lamp is two units across, and a district is a place.
           * A real <a> rather than a path with role="link": a focusable path
           * lands in document.activeElement but never fires a focus event, so
           * keyboard users would get no hover state and no readout. The click
           * is intercepted for client-side routing; Enter goes through it. */}
          {byHitOrder.map((d) => (
            <a
              key={d.id}
              href={`/${locale}/district/${d.id}`}
              tabIndex={0}
              aria-label={fillTemplate(strings.districtAria, {
                district: d.name,
                status: statusOf(d.id),
              })}
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
                setHint(null);
              }}
              onFocus={() => {
                setHovered(d.id);
                setHint(`${d.name} — ${statusOf(d.id)}`);
              }}
              onBlur={() => {
                setHovered(null);
                setHint(null);
              }}
            >
              <path className="map-hit" d={d.path} fill="transparent" />
            </a>
          ))}
        </svg>

        {/* 8 — the six district names, drawn as HTML over the map. In the SVG
         * they would scale with the frame and fall to five pixels on a phone;
         * here they keep their size. The 26 settlement names stay off the map —
         * only these six are permanent, because they are what orients a reader.
         * On a narrow screen even these give way, except where the power is out
         * and the name is the only thing left to read the dark area by; the
         * breakpoint is LABEL_BREAKPOINT, the width the placement maths is
         * sized for. */}
        {districts.map((d) => {
          const out = districtIsDark.has(d.id);
          return (
            <span
              key={d.id}
              style={{
                left: `${d.labelX * 100}%`,
                top: `${d.labelY * 100}%`,
                fontSize: LABEL_PX,
                textShadow: readabilityPlate(d.lightUnder),
              }}
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono leading-none tracking-[0.14em] ${
                out ? 'block text-text' : 'hidden text-muted md:block'
              }`}
            >
              {d.label}
            </span>
          );
        })}
      </div>

      <p aria-live="polite" className="m-0 min-h-[18px] pt-1 font-mono text-meta text-muted">
        {hint ?? strings.hint}
      </p>
    </div>
  );
}
