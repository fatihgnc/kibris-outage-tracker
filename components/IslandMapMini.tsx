import type { DistrictId } from '@/lib/types';
import type { MapDistrict, MapSettlement } from '@/lib/geography';
import { coreRadius, glowRadius } from '@/lib/map-style';

type Props = {
  viewBox: string;
  islandPath: string;
  districts: MapDistrict[];
  settlements: MapSettlement[];
  district: DistrictId;
  ariaLabel: string;
  caption: string;
};

// Static variant for the district page (§3.8). The island drops right back and
// one district keeps its brightness — the reader already knows where they are,
// so this only has to say where that is on the island. No animation, no
// interaction, and the light is a flat fill rather than the radial source: at
// this size a gradient reads as a smudge.
//
// The halo is pulled well in from the radius the big map uses. There is a lamp
// for every name the ingest can match, and İskele alone holds fifty of them: at
// full size, and with the flat fill not falling off the way the gradient does,
// a district came out as one solid patch instead of a scatter of villages.
const MINI_HALO = 0.45;
export default function IslandMapMini({
  viewBox,
  islandPath,
  districts,
  settlements,
  district,
  ariaLabel,
  caption,
}: Props) {
  return (
    <figure className="m-0">
      <svg viewBox={viewBox} role="img" aria-label={ariaLabel} className="block h-auto w-full bg-night">
        <rect x="-100%" y="-100%" width="300%" height="300%" fill="var(--color-night)" />
        <path d={islandPath} fill="var(--color-text)" fillOpacity={0.04} />
        {districts.map((d) => (
          <path
            key={d.id}
            d={d.path}
            fill="var(--color-text)"
            fillOpacity={d.id === district ? 0.13 : 0.06}
          />
        ))}
        {districts.map((d) => (
          <path key={d.id} d={d.path} fill="none" stroke="var(--color-dark)" strokeWidth={0.6} />
        ))}
        <path
          d={islandPath}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={1.2}
          strokeOpacity={0.7}
          strokeLinejoin="round"
        />
        {settlements
          .filter((s) => s.district === district)
          .map((s) => (
            <g key={s.name}>
              <circle
                cx={s.x}
                cy={s.y}
                r={glowRadius(s.weight) * MINI_HALO}
                fill="var(--color-lamp)"
                fillOpacity={0.1}
              />
              <circle cx={s.x} cy={s.y} r={coreRadius(s.weight)} fill="var(--color-lamp)" />
            </g>
          ))}
      </svg>
      <figcaption className="mt-1 font-mono text-meta text-muted">{caption}</figcaption>
    </figure>
  );
}
