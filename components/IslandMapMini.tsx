import type { DistrictId } from '@/lib/types';
import type { MapPoint } from '@/lib/geography';

type Props = {
  viewBox: string;
  islandPath: string;
  northPath: string;
  points: MapPoint[];
  district: DistrictId;
  ariaLabel: string;
  caption: string;
};

// Small static map variant for the district page (§3.8): whole island muted,
// the one district's points highlighted. No animation, no interaction.
export default function IslandMapMini({ viewBox, islandPath, northPath, points, district, ariaLabel, caption }: Props) {
  return (
    <figure className="m-0">
      <svg viewBox={viewBox} role="img" aria-label={ariaLabel} className="block h-auto w-full">
        <path
          d={islandPath}
          fill="var(--color-text)"
          fillOpacity={0.03}
          stroke="var(--color-muted)"
          strokeWidth={1.6}
          strokeOpacity={0.6}
          strokeLinejoin="round"
        />
        <path
          d={northPath}
          fill="var(--color-text)"
          fillOpacity={0.06}
          stroke="var(--color-muted)"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        {points.map((point) => {
          const highlighted = point.district === district;
          return (
            <g key={point.name}>
              {highlighted && (
                <>
                  <circle cx={point.x} cy={point.y} r={17} fill="var(--color-lamp)" opacity={0.1} />
                  <circle cx={point.x} cy={point.y} r={9} fill="var(--color-lamp)" opacity={0.22} />
                </>
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={highlighted ? 3.6 : 2}
                fill={highlighted ? 'var(--color-lamp)' : 'var(--color-dark)'}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 font-mono text-meta text-muted">{caption}</figcaption>
    </figure>
  );
}
