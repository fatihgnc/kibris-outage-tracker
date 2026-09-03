// Shared story fixtures. Components read their data through lib/data.ts in
// the app; stories skip that seam and build the same shapes directly from
// lib/mock.ts, so every story renders with the site's own realistic fixture
// data instead of a story-specific stand-in.
import { tr } from '@/lib/i18n/tr';
import { en } from '@/lib/i18n/en';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { getMockOutages, getMockMonthlyTotals } from '@/lib/mock';
import { getMapGeometry, resolveDarkness, settlementSlugs } from '@/lib/geography';
import { deriveStatus, formatTimeRange, islandHour, readEndOf } from '@/lib/time';
import { DISTRICT_IDS, DISTRICTS } from '@/lib/districts';
import type { Locale } from '@/lib/i18n/config';
import type { Outage } from '@/lib/types';

export const dicts: Record<Locale, Dictionary> = { tr, en };

// A fixed instant rather than Date.now(): a story's controls and screenshots
// should not change from one Storybook run to the next.
export const NOW = Date.parse('2026-09-03T09:00:00.000Z');

export const mockOutages: Outage[] = getMockOutages(NOW);

export function outageByKind(kind: Outage['kind'], status: 'active' | 'upcoming' | 'past' = 'active'): Outage {
  const match = mockOutages.find((o) => o.kind === kind && deriveStatus(o, NOW) === status);
  if (!match) throw new Error(`No mock outage of kind "${kind}" with status "${status}"`);
  return match;
}

export const geometry = getMapGeometry();

export function mapLegendProps(locale: Locale) {
  const dict = dicts[locale];
  return { lead: dict.map.legendLead, powerOn: dict.map.powerOn, powerOut: dict.map.powerOut, backToday: dict.map.backToday };
}

// Mirrors app/[locale]/page.tsx: the map is handed finished sentences, never
// raw records.
export function islandMapProps(locale: Locale) {
  const dict = dicts[locale];
  const active = mockOutages.filter((o) => deriveStatus(o, NOW) === 'active');
  const outages = Object.fromEntries(
    [...resolveDarkness(active, geometry.settlements)].map(([name, o]) => [
      name,
      { kind: dict.kind[o.kind], when: formatTimeRange(o, locale, dict), source: o.source },
    ]),
  );
  const dayAgo = NOW - 24 * 60 * 60 * 1000;
  const embers = [
    ...new Set(
      mockOutages
        .filter((o) => readEndOf(o) >= dayAgo && Date.parse(o.startsAt) <= NOW)
        .flatMap((o) => [...resolveDarkness([o], geometry.settlements).keys()]),
    ),
  ].filter((name) => !outages[name]);

  return {
    viewBox: geometry.viewBox,
    width: geometry.width,
    height: geometry.height,
    islandPath: geometry.islandPath,
    north: geometry.north,
    districts: geometry.districts,
    settlements: geometry.settlements,
    outages,
    embers,
    hour: islandHour(NOW),
    locale,
    strings: {
      ariaLabel: dict.map.ariaLabel,
      hint: dict.map.hint,
      powerOn: dict.map.powerOn,
      powerOut: dict.map.powerOut,
      pointAria: dict.map.pointAria,
      districtAria: dict.map.districtAria,
      backToday: dict.map.backToday,
      openDistrict: dict.map.openDistrict,
    },
  };
}

export function searchPlaces(locale: Locale) {
  const { outages } = islandMapProps(locale);
  return settlementSlugs()
    .map(({ slug, settlement }) => ({
      name: settlement.name,
      district: settlement.district,
      slug,
      hasPage: true,
      out: Boolean(outages[settlement.name]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export const districtNames = Object.fromEntries(DISTRICT_IDS.map((id) => [id, DISTRICTS[id].name]));

export const monthlyTotals = getMockMonthlyTotals('lefkosa', NOW);

export function chartStrings(locale: Locale) {
  const dict = dicts[locale];
  return {
    ariaLabel: dict.chart.ariaLabel,
    legendPlanned: dict.chart.legendPlanned,
    legendFault: dict.chart.legendFault,
    legendOpen: dict.chart.legendOpen,
    detailOpen: dict.chart.detailOpen,
    detail: dict.chart.detail,
    detailHint: dict.chart.detailHint,
    monthAria: dict.chart.monthAria,
    hourUnit: dict.time.hour,
  };
}
