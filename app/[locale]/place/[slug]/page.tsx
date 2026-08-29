import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getAreaKeyCounts, getNow, getOutagesByAreaKey } from '@/lib/data';
import { bucketMonthlyTotals, deriveStatus, formatDateLong } from '@/lib/time';
import { DISTRICTS } from '@/lib/geography';
import { areaKeyOf, findEligiblePlace, type EligiblePlace } from '@/lib/places';
import { addressable } from '@/lib/slug';
import { routeHref } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonld';
import type { ArchivedOutage } from '@/lib/types';
import JsonLd from '@/components/JsonLd';
import OutageCard from '@/components/OutageCard';
import HistoryChart from '@/components/HistoryChart';

type Props = { params: Promise<{ locale: string; slug: string }> };

// A settlement page exists only where there is a history worth reading, so the
// resolve step is a lookup *and* a threshold — see lib/places.ts. Cached
// because generateMetadata and the body both need it.
const loadPlace = cache(async (slug: string): Promise<EligiblePlace | null> => {
  return findEligiblePlace(slug, await getAreaKeyCounts(await getNow()));
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const place = await loadPlace(slug);
  if (!place) return {};
  const dict = await getDictionary(locale);
  const name = place.settlement.name;
  return pageMetadata({
    locale,
    dict,
    href: (l) => routeHref(l, 'place', place.slug),
    title: dict.meta.placeTitle(name),
    description: dict.meta.placeDescription(name),
  });
}

export default async function PlacePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const place = await loadPlace(slug);
  // Below the threshold this is not an empty page, it is not a page: nothing
  // links here and the sitemap does not list it.
  if (!place) notFound();

  const dict = await getDictionary(locale);
  const now = await getNow();
  const name = place.settlement.name;
  const district = DISTRICTS[place.settlement.district];

  const records = await getOutagesByAreaKey(now, areaKeyOf(place.slug));
  const byStart = (a: ArchivedOutage, b: ArchivedOutage) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const live = records.filter((record) => !record.cancelled);
  const active = live.filter((record) => deriveStatus(record, now) === 'active').sort(byStart);
  const upcoming = live.filter((record) => deriveStatus(record, now) === 'upcoming').sort(byStart);
  // Newest first, and retractions are kept: that a planned outage was announced
  // and called off is part of this place's history (§10.6). The card marks them.
  const past = records
    .filter((record) => deriveStatus(record, now) === 'past')
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));

  // Cancelled records are excluded here and only here. They are worth listing
  // as history but they are not hours anyone spent in the dark, and the
  // district chart leaves them out for the same reason — the two charts have to
  // count an outage the same way.
  const totals = bucketMonthlyTotals(live, now);
  const totalHours = totals.reduce((sum, t) => sum + t.plannedHours + t.faultHours, 0);
  const numberFormat = new Intl.NumberFormat(locale);
  const earliest = records.reduce(
    (oldest, record) => (Date.parse(record.startsAt) < Date.parse(oldest) ? record.startsAt : oldest),
    records[0]?.startsAt ?? new Date(now).toISOString(),
  );

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: district.name, path: routeHref(locale, 'district', place.settlement.district) },
          { name, path: routeHref(locale, 'place', place.slug) },
        ])}
      />
      {past.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            dict.meta.placeTitle(name),
            addressable(past).map((entry) => ({
              name: dict.meta.outageTitle(district.name, formatDateLong(entry.record.startsAt, locale)),
              path: routeHref(locale, 'outage', entry.slug),
            })),
          )}
        />
      )}

      <section className="pt-4">
        <Link
          href={routeHref(locale, 'district', place.settlement.district)}
          className="font-mono text-meta text-muted no-underline hover:text-text"
        >
          &larr; {fill(dict.place.backToDistrict, { district: district.name })}
        </Link>
        <h1 className="opsz-120 m-0 mt-2 font-display text-display font-semibold tracking-[-0.02em] text-text">
          {dict.meta.placeTitle(name)}
        </h1>
        <p className="mb-0 mt-2 max-w-[52ch] text-pretty text-small text-muted">{dict.place.summary(name)}</p>
        <p className="m-0 mt-1 font-mono text-meta text-muted">
          {fill(dict.place.count, {
            count: numberFormat.format(records.length),
            since: formatDateLong(earliest, locale),
          })}
        </p>
      </section>

      <section className="pt-7">
        <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.place.now}</h2>
        {active.length > 0 ? (
          <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {active.map((record) => (
              <li key={record.id}>
                <OutageCard outage={record} status="active" locale={locale} dict={dict} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-2 text-small text-muted">{dict.place.noActive(name)}</p>
        )}
      </section>

      <section className="pt-7">
        <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.place.upcoming}</h2>
        {upcoming.length > 0 ? (
          <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {upcoming.map((record) => (
              <li key={record.id}>
                <OutageCard outage={record} status="upcoming" locale={locale} dict={dict} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-2 text-small text-muted">{dict.place.noUpcoming}</p>
        )}
      </section>

      {totalHours > 0 && (
        <section className="pt-8">
          <h2 className="opsz-40 m-0 mb-3 font-display text-h2 font-semibold text-text">{dict.district.last12}</h2>
          <HistoryChart
            totals={totals}
            locale={locale}
            strings={{
              ariaLabel: dict.chart.ariaLabel,
              legendPlanned: dict.chart.legendPlanned,
              legendFault: dict.chart.legendFault,
              detail: dict.chart.detail,
              detailHint: dict.chart.detailHint,
              monthAria: dict.chart.monthAria,
              hourUnit: dict.time.hour,
            }}
          />
        </section>
      )}

      {past.length > 0 && (
        <section className="pt-8">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.place.history}</h2>
          <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((record) => (
              <li key={record.id}>
                <OutageCard
                  outage={record}
                  status="past"
                  locale={locale}
                  dict={dict}
                  now={now}
                  compact
                  cancelled={record.cancelled}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 border-t border-dark pt-4">
        <p className="m-0 text-small text-muted">
          {dict.home.guidesLead}{' '}
          <Link
            href={routeHref(locale, 'guides')}
            className="text-text underline decoration-dark underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
          >
            {dict.home.guidesLink}
          </Link>
        </p>
      </section>
    </div>
  );
}
