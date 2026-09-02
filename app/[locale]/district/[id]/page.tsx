import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getAreaKeyCounts, getFreshness, getMonthlyTotals, getNow, getOutages } from '@/lib/data';
import { deriveStatus, formatClock } from '@/lib/time';
import { DISTRICT_IDS, DISTRICTS, getMapGeometry, isDistrictId } from '@/lib/geography';
import type { Outage } from '@/lib/types';
import IslandMapMini from '@/components/IslandMapMini';
import OutageCard from '@/components/OutageCard';
import HistoryChart from '@/components/HistoryChart';
import AdSlot from '@/components/AdSlot';
import { eligiblePlaces } from '@/lib/places';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/jsonld';
import { routeHref } from '@/lib/routes';
import JsonLd from '@/components/JsonLd';

type Props = { params: Promise<{ locale: string; id: string }> };

// Six districts, both locales: a short, closed list, so every district page
// is prerendered and revalidates on the layout's clock instead of making its
// first reader wait for a render.
export function generateStaticParams() {
  return DISTRICT_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isDistrictId(id)) return {};
  const dict = await getDictionary(locale);
  const name = DISTRICTS[id].name;
  return pageMetadata({
    locale,
    dict,
    href: (l) => routeHref(l, 'district', id),
    title: dict.meta.districtTitle(name),
    description: dict.meta.districtDescription(name),
  });
}

export default async function DistrictPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale) || !isDistrictId(id)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const now = await getNow();
  const [outages, totals, freshness, areaCounts] = await Promise.all([
    getOutages(now),
    getMonthlyTotals(id, now),
    getFreshness(now),
    getAreaKeyCounts(now),
  ]);

  const byStart = (a: Outage, b: Outage) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const districtOutages = outages.filter((o) => o.district === id);
  const active = districtOutages.filter((o) => deriveStatus(o, now) === 'active').sort(byStart);
  const upcoming = districtOutages.filter((o) => deriveStatus(o, now) === 'upcoming').sort(byStart);

  const district = DISTRICTS[id];
  // The English exonym appears here and nowhere else (§7.3).
  const displayName = locale === 'en' && district.exonym ? `${district.name} (${district.exonym})` : district.name;
  // The heading says what the page is about rather than only where it is: the
  // <title> already reads "Lefkoşa elektrik kesintileri", and a bare place name
  // as the H1 left the two disagreeing about the subject of the page.
  const heading = dict.district.h1(displayName);
  const summary = active.length
    ? dict.district.summaryActive(district.name)
    : fill(dict.district.summaryQuiet, { district: district.name });

  const geometry = getMapGeometry();
  // The settlements in this district that have a page of their own. Without
  // these links nothing on the site points at a settlement page, and a page
  // reached only from the sitemap is a page search engines treat as orphaned.
  const places = eligiblePlaces(areaCounts).filter((place) => place.settlement.district === id);
  const numberFormat = new Intl.NumberFormat(locale);
  const totalHours = totals.reduce((sum, t) => sum + t.plannedHours + t.faultHours, 0);
  const openFaults = totals.reduce((sum, t) => sum + t.openFaults, 0);

  return (
    <div className="w-full">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: district.name, path: routeHref(locale, 'district', id) },
        ])}
      />

      <section className="flex flex-wrap items-start gap-x-7 gap-y-4 pt-4">
        <div className="min-w-[260px] flex-[1_1_300px]">
          <Link href={`/${locale}`} className="font-mono text-meta text-muted no-underline hover:text-text">
            ← {dict.district.back}
          </Link>
          <h1 className="opsz-120 m-0 mt-2 font-display text-display font-semibold tracking-[-0.02em] text-text">
            {heading}
          </h1>
          <p className="mb-0 mt-2 max-w-[44ch] text-pretty text-small text-muted">{summary}</p>
        </div>
        <div className="min-w-[220px] flex-[0_1_280px]">
          <IslandMapMini
            viewBox={geometry.viewBox}
            islandPath={geometry.islandPath}
            districts={geometry.districts}
            settlements={geometry.settlements}
            district={id}
            ariaLabel={fill(dict.district.miniAria, { district: district.name })}
            caption={fill(dict.district.miniCaption, { district: district.name })}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 pt-6 sm:grid-cols-2">
        <section>
          <h2 className="opsz-40 m-0 mb-2.5 font-display text-h2 font-semibold text-text">{dict.district.now}</h2>
          {active.length > 0 ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {active.map((outage) => (
                <li key={outage.id}>
                  <OutageCard outage={outage} status="active" locale={locale} dict={dict} now={now} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-[4px] border border-dark p-4">
              <p className="opsz-40 m-0 font-display text-body font-semibold text-text">
                {dict.district.noActive(district.name)}
              </p>
              <p className="m-0 font-mono text-meta text-muted">
                {freshness.lastCheckedAt
                  ? fill(dict.list.checkedAsOf, { time: formatClock(freshness.lastCheckedAt, locale) })
                  : dict.statusBar.neverChecked}
              </p>
            </div>
          )}
        </section>

        <section>
          <h2 className="opsz-40 m-0 mb-2.5 font-display text-h2 font-semibold text-text">
            {dict.district.upcoming}
          </h2>
          {upcoming.length > 0 ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {upcoming.map((outage) => (
                <li key={outage.id}>
                  <OutageCard outage={outage} status="upcoming" locale={locale} dict={dict} now={now} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 font-mono text-meta text-muted">{dict.district.noUpcoming}</p>
          )}
        </section>
      </div>

      {/* Between "upcoming" and the history chart — never between "now" and
       * "upcoming", and never while the data is stale (§11.3). */}
      <AdSlot slot="district-mid" label={dict.ad.label} suppressed={freshness.stale} />

      <section className="pt-7">
        <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.district.last12}</h2>
          <span className="font-mono text-meta text-muted">
            {fill(dict.chart.summary, { hours: numberFormat.format(totalHours) })}
            {/* Said beside the total, because the total leaves them out. */}
            {openFaults > 0 && ` · ${fill(dict.chart.detailOpen, { open: numberFormat.format(openFaults) })}`}
          </span>
        </div>
        <HistoryChart
          totals={totals}
          locale={locale}
          strings={{
            ariaLabel: dict.chart.ariaLabel,
            legendPlanned: dict.chart.legendPlanned,
            legendFault: dict.chart.legendFault,
            legendOpen: dict.chart.legendOpen,
            detailOpen: dict.chart.detailOpen,
            detail: dict.chart.detail,
            detailHint: dict.chart.detailHint,
            monthAria: dict.chart.monthAria,
            hourUnit: dict.time.hour,
          }}
        />
      </section>

      {places.length > 0 && (
        <section className="pt-8">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.district.places}</h2>
          <p className="m-0 mt-1 text-small text-muted">{dict.district.placesLead}</p>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-2 gap-y-2 p-0 text-small">
            {places.map((place) => (
              <li key={place.slug}>
                <Link
                  href={routeHref(locale, 'place', place.slug)}
                  className="inline-flex min-h-11 items-center rounded-[2px] border border-dark px-4 text-text no-underline hover:border-lamp"
                >
                  {place.settlement.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
