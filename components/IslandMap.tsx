'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fill as fillTemplate } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';

export type IslandMapPoint = {
  name: string;
  district: string;
  districtName: string;
  x: number;
  y: number;
  out: boolean;
};

type Props = {
  viewBox: string;
  islandPath: string;
  northPath: string;
  points: IslandMapPoint[];
  locale: Locale;
  strings: {
    ariaLabel: string;
    hint: string;
    powerOn: string;
    powerOut: string;
    pointAria: string; // {name} {status} {district}
  };
};

// The signature element (§3). Points ignite west to east on first paint
// (~900ms), then points under an outage fade back to dark. This is the single
// orchestrated moment on the site; prefers-reduced-motion skips it entirely
// via the .map-anim rule in globals.css and the base styles below, which
// already describe the final state.
export default function IslandMap({ viewBox, islandPath, northPath, points, locale, strings }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<IslandMapPoint | null>(null);

  const delays = useMemo(() => {
    const order = points.map((_, i) => i).sort((a, b) => points[a].x - points[b].x);
    const step = 900 / Math.max(points.length, 1);
    const byIndex = new Array<number>(points.length);
    order.forEach((pointIndex, rank) => {
      byIndex[pointIndex] = Math.round(rank * step);
    });
    return byIndex;
  }, [points]);

  const open = (district: string) => router.push(`/${locale}/district/${district}`);

  return (
    <div>
      <svg
        viewBox={viewBox}
        role="group"
        aria-label={strings.ariaLabel}
        className="mx-auto block h-auto max-h-[280px] w-full max-w-[660px] overflow-visible sm:max-h-none"
      >
        <path
          d={islandPath}
          fill="var(--color-text)"
          fillOpacity={0.03}
          stroke="var(--color-muted)"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        <path
          d={northPath}
          fill="var(--color-text)"
          fillOpacity={0.11}
          stroke="var(--color-muted)"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        {points.map((point, i) => {
          const status = point.out ? strings.powerOut : strings.powerOn;
          const delay = delays[i];
          const igniteAnim = `ignite 320ms ease-out ${delay}ms both`;
          return (
            <g
              key={point.name}
              tabIndex={0}
              role="link"
              aria-label={fillTemplate(strings.pointAria, {
                name: point.name,
                status,
                district: point.districtName,
              })}
              onClick={() => open(point.district)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open(point.district);
                }
              }}
              onMouseEnter={() => setHovered(point)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(point)}
              onBlur={() => setHovered(null)}
              className="cursor-pointer"
            >
              {/* generous invisible hit area for touch */}
              <circle cx={point.x} cy={point.y} r={26} fill="transparent" />
              <circle
                cx={point.x}
                cy={point.y}
                r={point.out ? 2.4 : 3.4}
                fill={point.out ? 'var(--color-dark)' : 'var(--color-lamp)'}
                className="map-anim"
                style={{ animation: igniteAnim }}
              />
              {/* Glow is permitted only on lit points; an unlit point is unlit. */}
              <g
                className="map-anim"
                style={{
                  opacity: point.out ? 0 : 1,
                  animation: point.out
                    ? `${igniteAnim}, extinguish 400ms ease-in 960ms forwards`
                    : igniteAnim,
                }}
              >
                <circle cx={point.x} cy={point.y} r={11} fill="var(--color-lamp)" opacity={0.1} />
                <circle cx={point.x} cy={point.y} r={6.5} fill="var(--color-lamp)" opacity={0.22} />
                <circle cx={point.x} cy={point.y} r={3.4} fill="var(--color-lamp)" />
              </g>
            </g>
          );
        })}
      </svg>
      <p aria-live="polite" className="m-0 min-h-[18px] font-mono text-meta text-muted">
        {hovered ? `${hovered.name} — ${hovered.out ? strings.powerOut : strings.powerOn}` : strings.hint}
      </p>
    </div>
  );
}
