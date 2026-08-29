import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getFreshness, getNow, getOutages } from '@/lib/data';
import { deriveStatus, formatClock, formatDateLong, formatTimeRange } from '@/lib/time';
import { DISTRICTS, getMapGeometry, isDistrictId, resolveDarkness } from '@/lib/geography';
import type { DistrictId, Outage } from '@/lib/types';
import IslandMap from '@/components/IslandMap';
import DistrictFilter from '@/components/DistrictFilter';
import OutageCard from '@/components/OutageCard';
import Countdown from '@/components/Countdown';
import AdSlot from '@/components/AdSlot';
import { CONSENT_COOKIE, readConsent } from '@/lib/consent';
import { pageMetadata } from '@/lib/seo';
import { faqJsonLd, itemListJsonLd, siteJsonLd } from '@/lib/jsonld';
import { routeHref } from '@/lib/routes';
import { addressable } from '@/lib/slug';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';

// One full row on a desktop grid, so the ad can never appear before a reader
// has seen the first cards.
const FIRST_BLOCK = 6;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ district?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  // Title and description come from the layout; the district filter lives in
  // the query string and the canonical points past it.
  return pageMetadata({ locale, dict: await getDictionary(locale) });
}

export default async function HomePage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const { district: districtRaw } = await searchParams;
  const selectedDistrict: DistrictId | null =
    typeof districtRaw === 'string' && isDistrictId(districtRaw) ? districtRaw : null;

  const now = await getNow();
  const [outages, freshness, cookieStore] = await Promise.all([getOutages(now), getFreshness(now), cookies()]);
  const consent = readConsent(cookieStore.get(CONSENT_COOKIE)?.value);

  const byStart = (a: Outage, b: Outage) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const active = outages.filter((o) => deriveStatus(o, now) === 'active').sort(byStart);
  const upcoming = outages.filter((o) => deriveStatus(o, now) === 'upcoming').sort(byStart);
  const activeDistricts = new Set(active.map((o) => o.district));

  const inSelected = (o: Outage) => !selectedDistrict || o.district === selectedDistrict;
  const list = [...active.filter(inSelected), ...upcoming.filter(inSelected)];

  const numberFormat = new Intl.NumberFormat(locale);
  const heroTitle =
    activeDistricts.size === 0
      ? dict.hero.allClear
      : activeDistricts.size === 1
        ? dict.hero.oneOut(DISTRICTS[[...activeDistricts][0]].name)
        : fill(dict.hero.manyOut, { count: numberFormat.format(activeDistricts.size) });
  const next = upcoming[0];

  const geometry = getMapGeometry();
  // The map is handed finished sentences rather than records: the locale, the
  // clock and the dictionary all live here, and the popover only has to print.
  const lampOutages = Object.fromEntries(
    [...resolveDarkness(active, geometry.settlements)].map(([name, o]) => [
      name,
      { kind: dict.kind[o.kind], when: formatTimeRange(o, locale, dict), source: o.source },
    ]),
  );

  const listTitle = selectedDistrict
    ? fill(dict.list.titleDistrict, { district: DISTRICTS[selectedDistrict].name })
    : dict.list.titleAll;

  // `getOutages` already reaches thirty days back — the records are in hand, so
  // this section costs no extra query. It exists because on a quiet day the page
  // above it is one sentence, a map and a row of chips: nothing for a reader who
  // arrived asking what has been happening, and nothing for a crawler either.
  const recent = outages
    .filter((o) => deriveStatus(o, now) === 'past')
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, 6);

  return (
    <>
      <JsonLd data={siteJsonLd(locale, dict)} />
      {list.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            listTitle,
            addressable(list).map(({ record, slug }) => ({
              name: dict.meta.outageTitle(
                DISTRICTS[record.district].name,
                formatDateLong(record.startsAt, locale),
              ),
              path: routeHref(locale, 'outage', slug),
            })),
          )}
        />
      )}
      {/* The questions below are printed on the page, which is what makes this
        * legitimate: structured data describing answers a reader cannot see is
        * exactly what the FAQ rich result guidelines forbid. */}
      <JsonLd data={faqJsonLd(dict.faq)} />

      <section className="pt-2">
        <h1 className="opsz-120 m-0 max-w-[22ch] text-pretty font-display text-display font-semibold tracking-[-0.02em] text-text">
          {heroTitle}
        </h1>
        <p className="mb-0 mt-1 max-w-[52ch] text-pretty font-mono text-small text-muted">
          {next ? (
            <>
              {fill(dict.hero.nextPrefix, {
                district: DISTRICTS[next.district].name,
                time: formatClock(next.startsAt, locale),
              })}
              <Countdown
                targetIso={next.startsAt}
                pattern={dict.countdown.plain}
                units={{ day: dict.time.day, hour: dict.time.hour, minute: dict.time.minute }}
                initialNow={now}
              />
            </>
          ) : (
            dict.hero.noneUpcoming
          )}
        </p>
      </section>

      <section className="pt-1">
        <IslandMap
          viewBox={geometry.viewBox}
          width={geometry.width}
          height={geometry.height}
          islandPath={geometry.islandPath}
          districts={geometry.districts}
          settlements={geometry.settlements}
          outages={lampOutages}
          locale={locale}
          strings={{
            ariaLabel: dict.map.ariaLabel,
            hint: dict.map.hint,
            powerOn: dict.map.powerOn,
            powerOut: dict.map.powerOut,
            pointAria: dict.map.pointAria,
            districtAria: dict.map.districtAria,
          }}
        />
      </section>

      <section className="pt-5">
        <DistrictFilter dict={dict} selected={selectedDistrict} basePath={routeHref(locale)} />
      </section>

      <section className="pt-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{listTitle}</h2>
          <span className="font-mono text-meta text-muted">
            {fill(dict.list.sorted, { count: numberFormat.format(list.length) })}
          </span>
        </div>
        {list.length > 0 ? (
          <>
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {list.slice(0, FIRST_BLOCK).map((outage) => (
                <li key={outage.id}>
                  <OutageCard
                    outage={outage}
                    status={deriveStatus(outage, now)}
                    locale={locale}
                    dict={dict}
                    now={now}
                  />
                </li>
              ))}
            </ul>
            {list.length > FIRST_BLOCK && (
              <>
                {/* After the first block of cards, never before one, and never
                 * while the data is stale (§11.3). */}
                <AdSlot
                  slot="home-mid"
                  label={dict.ad.label}
                  consent={consent}
                  suppressed={freshness.stale}
                />
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {list.slice(FIRST_BLOCK).map((outage) => (
                    <li key={outage.id}>
                      <OutageCard
                        outage={outage}
                        status={deriveStatus(outage, now)}
                        locale={locale}
                        dict={dict}
                        now={now}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2 rounded-[4px] border border-dark px-5 py-6">
            <p className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.list.empty}</p>
            <p className="m-0 font-mono text-meta text-muted">
              {freshness.lastCheckedAt
                ? fill(dict.list.checkedAsOf, { time: formatClock(freshness.lastCheckedAt, locale) })
                : dict.statusBar.neverChecked}
            </p>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="pt-9">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.home.recent}</h2>
            <Link
              href={routeHref(locale, 'archive')}
              className="font-mono text-meta text-muted no-underline hover:text-text"
            >
              {dict.home.recentAll} &rarr;
            </Link>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((outage) => (
              <li key={outage.id}>
                <OutageCard outage={outage} status="past" locale={locale} dict={dict} now={now} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-9">
        <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.home.faq}</h2>
        <dl className="m-0 mt-3 flex flex-col gap-4">
          {dict.faq.map((entry) => (
            <div key={entry.q}>
              <dt className="opsz-24 m-0 font-display text-body font-semibold text-text">{entry.q}</dt>
              <dd className="m-0 mt-1 max-w-[68ch] text-pretty text-small text-muted">{entry.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pt-7">
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
    </>
  );
}
