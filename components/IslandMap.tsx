'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fill as fillTemplate } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { routeHref } from '@/lib/routes';
import type { MapDistrict, MapSettlement } from '@/lib/geography';
import {
  CORE_COOL_MS,
  EMBER_RING,
  EXTINGUISH_MS,
  HOVER_SWELL,
  LAMP_CORE,
  LAMP_CORE_FILL,
  LAMP_GLOW,
  LAMP_ON_MS,
  LEADER_LENGTH,
  OUT_GLOW,
  PULSE_MAX,
  PULSE_MS,
  RIPPLE_MAX,
  RIPPLE_MS,
  UNLIT_DOT,
} from '@/lib/map-style';

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
  /** Places that went dark earlier today and have their power back. */
  embers: string[];
  /** The hour on the island, 0-23. The map's night is the island's, not the reader's. */
  hour: number;
  locale: Locale;
  strings: {
    ariaLabel: string;
    hint: string;
    powerOn: string;
    powerOut: string;
    pointAria: string; // {name} {status} {district}
    districtAria: string; // {district}
    backToday: string;
    openDistrict: string; // {district}
  };
};

// §3.5, the one orchestrated moment on the site: the lamps come up west to
// east over ~900ms, then anything under an outage fades back out over 400ms.
const IGNITE_SPAN = 900;
const IGNITE_STEP = 320;
const EXTINGUISH_AT = IGNITE_SPAN + 60;
const SETTLED_AT = EXTINGUISH_AT + EXTINGUISH_MS + 100;

// How near the pointer has to be, in frame units, before a lamp claims it.
// This used to be a fraction of the glow, which worked when a lamp was one of
// twenty-six and spilled sixty units. At the density the map carries now the
// glow is twelve units for a village, and tying the target to it would mean
// hunting for a four-unit dot; the lamps sit further apart than this anyway, so
// nearest-wins settles the rest.
const HOVER_RADIUS = 14;

// How many districts have to be dark at once before the island reads as one
// event rather than a handful of separate ones. Three is where the language on
// the page changes too — one district is named, several are counted.
const EVENT_DISTRICTS = 3;

/**
 * A lamp's own breathing period and phase, from its index alone.
 *
 * Deterministic on purpose: this renders on the server first, and anything
 * random here would be a different number on the client and a hydration
 * mismatch. The two multipliers are coprime with the periods they are taken
 * against, so the phases do not fall into bands the eye can pick out as a wave.
 */
function breath(i: number): { duration: number; delay: number } {
  return { duration: 4200 + ((i * 977) % 2800), delay: -((i * 613) % 5200) };
}

/**
 * The wash the hour lays over the sea, as an angle and a strength.
 *
 * The sun crosses the island east to west, so dawn arrives on the right of the
 * frame and dusk leaves from the left — the same direction the lamps ignite in
 * (§3.5), which is not a coincidence worth hiding.
 *
 * There is no matching darkening for the small hours. The sea is the page's own
 * background and has to stay it: anything laid over it turns the full-bleed map
 * into a black band across a page that is not black, and the island stops
 * sitting on the site and starts sitting in a box.
 */
function skyOf(hour: number): { warmth: number; fromEast: boolean } {
  // Distance around the clock face, not along the number line: 23:00 is an
  // hour from midnight, not twenty-three.
  const apart = (centre: number) => {
    const raw = Math.abs(hour - centre);
    return Math.min(raw, 24 - raw);
  };
  const near = (centre: number, span: number) => Math.max(0, 1 - apart(centre) / span);
  const dawn = near(6, 2.2);
  const dusk = near(19.5, 2.2);
  return { warmth: Math.max(dawn, dusk), fromEast: dawn >= dusk };
}

export default function IslandMap({
  viewBox,
  width,
  height,
  islandPath,
  districts,
  settlements,
  outages,
  embers,
  hour,
  locale,
  strings,
}: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<MapSettlement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Set by a touch that landed on a lamp, so the click the browser fires next
  // reads the place instead of leaving the page. See the district anchors.
  const holdClick = useRef(false);

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

  // Two hundred lamps breathing forever is real main-thread work on a phone,
  // and most of a visit is spent below the map, reading the list. When the
  // island has been scrolled out of the viewport its animations are paused
  // (globals.css `.map-offstage`) — paused, not removed, so each lamp's
  // breath resumes mid-cycle exactly where it left off.
  const [offstage, setOffstage] = useState(false);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setOffstage(!entry.isIntersecting));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const darkNames = useMemo(() => new Set(Object.keys(outages)), [outages]);
  const emberNames = useMemo(() => new Set(embers), [embers]);

  const isOut = (name: string) => darkNames.has(name);

  // An island-scale event: enough districts out at once that the map should say
  // so rather than leave it to be counted off a scatter of dark dots.
  const eventMode =
    new Set(settlements.filter((s) => isOut(s.name)).map((s) => s.district)).size >=
    EVENT_DISTRICTS;

  // A lamp going out while the page is open is a moment, and the map had no way
  // of showing it: the light simply was not there on the next paint. This
  // watches the set, not the clock, so it fires on a data refresh and never on
  // load — `seen` starts holding whatever was dark when the map first painted.
  const seen = useRef<Set<string> | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  useEffect(() => {
    const previous = seen.current;
    seen.current = new Set(darkNames);
    if (!previous) return;
    const fresh = settlements.filter((s) => darkNames.has(s.name) && !previous.has(s.name));
    if (fresh.length === 0) return;
    const stamp = Date.now();
    setRipples((r) => [...r, ...fresh.map((s, i) => ({ id: stamp + i, x: s.x, y: s.y }))]);
    const timer = setTimeout(
      () => setRipples((r) => r.filter((ripple) => ripple.id < stamp)),
      RIPPLE_MS,
    );
    return () => clearTimeout(timer);
  }, [darkNames, settlements]);

  // The order is longitude, straight from the coordinates — the settlements
  // arrive from lib/geography already sorted west to east.
  const step = IGNITE_SPAN / Math.max(settlements.length - 1, 1);

  const open = (district: string) => router.push(routeHref(locale, 'district', district));
  const statusOf = (name: string) => (isOut(name) ? strings.powerOut : strings.powerOn);

  // Settlement names are never written on the map; they surface in the popover
  // when the pointer is over one, and on the line under it either way.
  const nearestSettlement = (event: { clientX: number; clientY: number }): MapSettlement | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
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
    return nearest && best <= HOVER_RADIUS ? nearest : null;
  };
  const showNearestSettlement = (event: { clientX: number; clientY: number }) => {
    setActive(nearestSettlement(event));
  };

  // A finger has no hover. Before this, a tap anywhere on a district opened
  // its page, and a phone — where most readers are — could never read a
  // lamp. Now a tap on a lamp reads it, exactly as hovering does; a second
  // tap on the same lamp, or a tap on open ground, opens the district. The
  // touch is handled at pointerup and the click that follows it is held
  // back, because it is that click the anchor would navigate on.
  const touchDistrict = (event: React.PointerEvent, district: string) => {
    if (event.pointerType !== 'touch') return;
    const nearest = nearestSettlement(event);
    if (!nearest || nearest.name === active?.name) return;
    holdClick.current = true;
    setHovered(district);
    setActive(nearest);
  };

  // Largest first, so the smallest district's hit area is never buried under a
  // neighbour's.
  const byHitOrder = [...districts].sort((a, b) => b.area - a.area);

  const activeOutage = active ? outages[active.name] : undefined;
  const activeEmber = Boolean(active && emberNames.has(active.name));
  const readout = active
    ? fillTemplate(strings.pointAria, {
        name: active.name,
        status: statusOf(active.name),
        district: districtName.get(active.district) ?? active.district,
      })
    : null;
  // Above the lamp, unless the lamp is near the top of the frame — Girne and
  // the panhandle sit within a popover's height of it. The hairline that joins
  // the two has to run the same way.
  const popoverBelow = active ? active.y / height < 0.28 : false;

  const sky = skyOf(hour);

  return (
    <div className={offstage ? 'map-offstage' : undefined}>
      {/* The frame carries the aspect ratio so the labels can be positioned in
       * percentages of it.
       *
       * It breaks out of the page column to the full width of the window: the
       * negative margins cancel whatever the column and its padding come to,
       * and 100vw takes it the rest of the way. Nothing caps the height — the
       * island's own proportions set it, and letting the width run is the
       * entire point. globals.css clips the body's horizontal overflow, which
       * is what makes 100vw safe next to a scrollbar.
       *
       * Only the frame breaks out. The line beneath it stays in the column
       * with the rest of the page's text. */}
      <div
        className="relative mx-[calc(50%-50vw)] w-[100vw]"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          role="group"
          aria-label={strings.ariaLabel}
          className="block h-full w-full bg-night"
          // A touch on the water lets go of whatever a touch on a lamp took.
          onPointerDown={(e) => {
            if (e.pointerType === 'touch' && !(e.target as Element).closest('a')) {
              setActive(null);
              setHovered(null);
            }
          }}
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
            {/* The dark places' own bloom. Weaker than the lamp's and shorter,
             * so a place that has gone out sits in the same drawing as the ones
             * that have not without ever looking like it is lit. */}
            <radialGradient id="map-out">
              <stop offset="0%" stopColor="var(--color-fault)" stopOpacity={0.62} />
              <stop offset="30%" stopColor="var(--color-fault)" stopOpacity={0.3} />
              <stop offset="62%" stopColor="var(--color-fault)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--color-fault)" stopOpacity={0} />
            </radialGradient>
            <filter id="map-soften" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation={3.5} />
            </filter>
            {/* The land is not a flat void. Fractal noise at a high frequency,
             * flattened to a faint alpha and laid inside the coast — it is not
             * meant to be seen as texture, only to stop the fill reading as
             * paper. */}
            <filter id="map-grain" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={3} seed={7} />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.79  0 0 0 0 0.82  0 0 0 0 0.86  0 0 0 0.5 0"
              />
            </filter>
            {/* Dawn from the east, dusk from the west (§3.3). One definition,
             * flipped, because the sun does not change colour on the way back. */}
            <linearGradient id="map-sky" x1={sky.fromEast ? '1' : '0'} x2={sky.fromEast ? '0' : '1'}>
              <stop offset="0%" stopColor="var(--color-lamp)" stopOpacity={0.16} />
              <stop offset="45%" stopColor="var(--color-lamp)" stopOpacity={0.04} />
              <stop offset="100%" stopColor="var(--color-lamp)" stopOpacity={0} />
            </linearGradient>
            <clipPath id="map-island-clip">
              <path d={islandPath} />
            </clipPath>
          </defs>

          {/* 1 — the sea, drawn well past the frame so no edge can band */}
          <rect x="-100%" y="-100%" width="300%" height="300%" fill="var(--color-night)" />

          {/* The hour, on the water: warm from whichever side the sun is on
           * near either end of the day, and nothing at all the rest of the
           * time. Far below the threshold where it would read as a colour — the
           * island is still drawn on the same night the page is.
           *
           * Clipped to the island. Laid over the full sea rect it tinted the
           * whole full-bleed frame away from --color-night, which is exactly
           * the site's own background — the frame's edges then banded against
           * the page above and below it, the "box" this comment already
           * worried about. Clipping keeps the open sea pixel-identical to the
           * page and puts the wash only on the land it is meant to warm. */}
          {sky.warmth > 0 && (
            <g clipPath="url(#map-island-clip)">
              <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill="url(#map-sky)"
                opacity={sky.warmth}
              />
            </g>
          )}

          {/* Depth: a faint bloom off the coast into the water, and two wider
           * contours past it. The island stops reading as a hole cut in the
           * night and starts reading as land with water around it — the same
           * trick a chart uses, at a tenth of the contrast. */}
          <path
            d={islandPath}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={26}
            strokeOpacity={0.03}
            filter="url(#map-soften)"
          />
          <path
            d={islandPath}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={16}
            strokeOpacity={0.05}
            filter="url(#map-soften)"
          />
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

          {/* The grain, inside the coast only. */}
          <g clipPath="url(#map-island-clip)">
            <rect
              x="0"
              y="0"
              width={width}
              height={height}
              filter="url(#map-grain)"
              opacity={0.05}
              style={{ mixBlendMode: 'overlay' }}
            />
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

          {/* An island-scale event. The land drops back so the lamps still
           * burning read as the few that are left, rather than as the normal
           * map with more gaps in it. Above the ground and below the light:
           * dimming the lamps would be dimming the data. */}
          <g clipPath="url(#map-island-clip)">
            <rect
              x="0"
              y="0"
              width={width}
              height={height}
              fill="var(--color-night)"
              className="map-anim"
              style={{ opacity: eventMode ? 0.42 : 0, transition: 'opacity 700ms ease' }}
            />
          </g>

          {/* 6 — district hairlines. Drawn in the palette's lightest tone
           * rather than its darkest: at --color-dark they were four shades off
           * the land they were drawn on and simply could not be seen. Now that
           * no district is named on the map (§3.6) these lines are the only
           * thing saying where one ends, so they have to read.
           *
           * Half the opacity and half the width of the coast, so the island
           * still reads as one shape first and a set of districts second. */}
          {districts.map((d) => (
            <path
              key={d.id}
              d={d.path}
              fill="none"
              stroke={hovered === d.id ? 'var(--color-lamp)' : 'var(--color-text)'}
              strokeOpacity={hovered === d.id ? 1 : 0.5}
              strokeWidth={hovered === d.id ? 1 : 0.6}
            />
          ))}

          {/* 7 — the coastline: thin, but it has to be readable, and it has to
           * stay the strongest line on the map now that the borders inside it
           * are lit in the same tone. */}
          <path
            d={islandPath}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />

          {/* Both lines are drawn under the light, not over it. Nine of the
           * hundred and ninety-three places sit within a line's width of one —
           * Girne, Karaoğlanoğlu, Karakum and Beyarmudu on the coast, five more
           * on a district border — and painted afterwards the line ran straight
           * through the lamp, so the one town on the map everybody looks for
           * first had a hairline across it.
           *
           * Nothing is lost by going underneath: the lamps composite with
           * `screen`, which can only add light, so a line under a lamp is
           * brightened rather than hidden. And a town's glow reaching past the
           * shoreline is the truth about light anyway — it does not stop at an
           * administrative edge (§3.3). */}

          {/* 5 — the light, and the whole of the map's data. One lamp per name
           * the ingest can match. Overlapping lamps add up, so the dense middle
           * of the island glows on its own. Isolated so the blend stays inside
           * the map.
           *
           * Not clipped to the coast. It was, and it cut every seaside town's
           * glow in half along a hard edge — Girne, Karaoğlanoğlu, Karakum sit
           * on the shoreline, and the light stopped dead at it as though the
           * water were a wall. Light does not stop at an edge, administrative
           * or otherwise; a coastal town glows over the water it stands on.
           * Nothing escapes into the south by this, because the clip was the
           * whole island and never the north alone. */}
          <g style={{ isolation: 'isolate' }}>
            {settlements.map((s, i) => {
              const out = isOut(s.name);
              const ignite = `ignite ${IGNITE_STEP}ms ease-out ${Math.round(i * step)}ms both`;
              const { duration, delay } = breath(i);
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
                    // On fast, off slow. A bulb reaches full almost at once and
                    // then takes a moment to let go, so the two directions are
                    // not one transition read backwards.
                    ...(settled
                      ? {
                          transition: `opacity ${out ? EXTINGUISH_MS : LAMP_ON_MS}ms ease-out`,
                        }
                      : {
                          animation: out
                            ? `${ignite}, extinguish ${EXTINGUISH_MS}ms ease-out ${EXTINGUISH_AT}ms forwards`
                            : ignite,
                        }),
                  }}
                >
                  {/* The breathing lives on the glow rather than on the group,
                   * so it multiplies with the state above instead of fighting
                   * it: a lamp on its way out fades while it breathes, and the
                   * fade still lands on nothing. Held back until the opening
                   * sequence is over — two animations on one element during the
                   * overture is a flicker, not a breath. */}
                  <circle
                    className="map-glow map-breathe"
                    r={LAMP_GLOW}
                    fill="url(#map-lamp)"
                    style={
                      settled
                        ? { animation: `breathe ${duration}ms ease-in-out ${delay}ms infinite` }
                        : undefined
                    }
                  />
                  {/* The hot point, and the first thing to go: it dies in a
                    * fifth of the time the glow behind it takes, so a lamp going
                    * out cools from cream through amber to nothing instead of
                    * being switched off. Its opacity multiplies with the group's
                    * above — that one is riding the long curve while this one is
                    * already gone. */}
                  <circle
                    className="map-anim"
                    r={LAMP_CORE}
                    fill={LAMP_CORE_FILL}
                    style={{
                      opacity: out ? 0 : 1,
                      ...(settled
                        ? { transition: `opacity ${out ? CORE_COOL_MS : LAMP_ON_MS}ms ease-out` }
                        : {
                            animation: out
                              ? `extinguish ${CORE_COOL_MS}ms ease-out ${EXTINGUISH_AT}ms forwards`
                              : undefined,
                          }),
                    }}
                  />
                </g>
              );
            })}

            {/* The pointer's own lamp, swollen. Inside the blend group so it
             * adds to the light already there rather than sitting on top of it
             * as a second, flatter disc. Only for a lamp that is lit: swelling
             * a dark one would say the power was back. */}
            {active && !isOut(active.name) && (
              <g transform={`translate(${active.x} ${active.y})`} className="pointer-events-none">
                <circle
                  r={LAMP_GLOW * HOVER_SWELL}
                  fill="url(#map-lamp)"
                  opacity={0.5}
                  style={{ mixBlendMode: 'screen' }}
                />
              </g>
            )}
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
           * place instead of one popping in after the other.
           *
           * Unclipped for the same reason as the light above: every one of
           * these sits on a coordinate the harvest already placed on land
           * (§3.2), so the clip could only ever shave a coastal one. */}
          <g>
            {settlements.map((s) => {
              const out = isOut(s.name);
              return (
                <g
                  key={s.name}
                  className="map-anim"
                  transform={`translate(${s.x} ${s.y})`}
                  style={{
                    opacity: out ? 1 : 0,
                    ...(settled
                      ? { transition: 'opacity 400ms ease' }
                      : // Mirrors the lamp's own fade: it arrives exactly as the
                        // light leaves, and `both` holds it hidden through the
                        // ignition before that.
                        { animation: out ? `ignite 400ms ease-in ${EXTINGUISH_AT}ms both` : 'none' }),
                  }}
                >
                  <circle className="map-out-glow" r={OUT_GLOW} fill="url(#map-out)" />
                  <circle r={UNLIT_DOT} fill="var(--color-fault)" />
                </g>
              );
            })}
          </g>

          {/* And the ping each dark place sends out. This is the map's answer to
           * the one thing it was bad at: finding the place that has gone out.
           * Static, a cold dot loses to a hundred and ninety lamps however wide
           * it is drawn; moving, it is the first thing the eye lands on.
           *
           * Each ring is offset by its own place's position, so the island does
           * not beat in time. Only the dark places carry one, so an island with
           * the power on is perfectly still apart from the breathing. */}
          <g className="pointer-events-none">
            {settlements
              .filter((s) => isOut(s.name))
              .map((s, i) => (
                <g key={s.name} transform={`translate(${s.x} ${s.y})`}>
                  <circle
                    className="map-pulse"
                    r={PULSE_MAX}
                    fill="none"
                    stroke="var(--color-fault)"
                    strokeWidth={1.7}
                    style={{
                      animation: `pulse ${PULSE_MS}ms ease-out ${-((i * 431) % PULSE_MS)}ms infinite`,
                    }}
                  />
                </g>
              ))}
          </g>

          {/* Today's ash. A place that went dark earlier and has its power back
           * is lit like any other — the live state is the truth and the light
           * keeps saying exactly one thing — but it carries a ring, and the
           * popover says what the ring is for. Nothing else on the page shows
           * this: the cards are a list, and only the map can say where the
           * day's outages were. */}
          <g className="pointer-events-none">
            {settlements
              .filter((s) => emberNames.has(s.name) && !isOut(s.name))
              .map((s) => (
                <circle
                  key={s.name}
                  className="map-anim"
                  cx={s.x}
                  cy={s.y}
                  r={EMBER_RING}
                  fill="none"
                  stroke="var(--color-lamp)"
                  strokeWidth={0.55}
                  strokeOpacity={0.35}
                  style={{ transition: 'stroke-opacity 400ms ease' }}
                />
              ))}
          </g>

          {/* The moment a lamp goes out, once. */}
          <g className="pointer-events-none">
            {ripples.map((ripple) => (
              <g key={ripple.id} transform={`translate(${ripple.x} ${ripple.y})`}>
                <circle
                  className="map-ripple"
                  r={RIPPLE_MAX}
                  fill="none"
                  stroke="var(--color-fault)"
                  strokeWidth={1.2}
                  style={{ animation: `ripple ${RIPPLE_MS}ms ease-out forwards` }}
                />
              </g>
            ))}
          </g>

          {/* A lamp the pointer is on gets a ring rather than more light: the
           * light is the data, and brightening it under the cursor would say
           * the power had come back. The hairline runs from the ring towards
           * the popover, so at this density it is never ambiguous which of two
           * neighbouring villages is being described. */}
          {active && (
            <g className="pointer-events-none">
              <circle
                cx={active.x}
                cy={active.y}
                r={LAMP_CORE + 4}
                fill="none"
                stroke={isOut(active.name) ? 'var(--color-fault)' : 'var(--color-lamp)'}
                strokeWidth={0.8}
                strokeOpacity={0.9}
              />
              <line
                x1={active.x}
                x2={active.x}
                y1={active.y + (popoverBelow ? LAMP_CORE + 5 : -(LAMP_CORE + 5))}
                y2={active.y + (popoverBelow ? LEADER_LENGTH : -LEADER_LENGTH)}
                stroke={isOut(active.name) ? 'var(--color-fault)' : 'var(--color-lamp)'}
                strokeWidth={0.5}
                strokeOpacity={0.55}
              />
            </g>
          )}

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
              href={routeHref(locale, 'district', d.id)}
              tabIndex={0}
              aria-label={fillTemplate(strings.districtAria, { district: d.name })}
              onClick={(e) => {
                e.preventDefault();
                if (holdClick.current) {
                  holdClick.current = false;
                  return;
                }
                open(d.id);
              }}
              onPointerUp={(e) => touchDistrict(e, d.id)}
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
              transform: popoverBelow
                ? 'translate(-50%, 1rem)'
                : 'translate(-50%, calc(-100% - 0.75rem))',
            }}
          >
            <div className="border border-dark bg-night/95 px-2 py-1.5 font-mono text-meta leading-snug">
              <p className="m-0 text-text">{active.name}</p>
              <p className={`m-0 ${isOut(active.name) ? 'text-fault' : 'text-muted'}`}>
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
              {/* What the ring around a lit lamp means. */}
              {activeEmber && !activeOutage && (
                <p className="m-0 mt-1 text-muted">{strings.backToday}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* The readout, and — while a place is being read — the way onward.
        * The popover cannot carry a link (§3.6), so the link sits here, in
        * the column, where a finger that just read a lamp can reach it. */}
      <p aria-live="polite" className="m-0 min-h-[18px] pt-1 font-mono text-meta text-muted">
        {readout ?? strings.hint}
        {active && (
          <>
            {' · '}
            <Link
              href={routeHref(locale, 'district', active.district)}
              className="whitespace-nowrap text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
            >
              {fillTemplate(strings.openDistrict, {
                district: districtName.get(active.district) ?? active.district,
              })}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
