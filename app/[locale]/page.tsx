import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getFreshness, getNow, getOutages } from '@/lib/data';
import {
  deriveStatus,
  formatClock,
  formatDateLong,
  formatTimeRange,
  islandHour,
  readEndOf,
} from '@/lib/time';
import { DISTRICT_IDS, DISTRICTS, getMapGeometry, resolveDarkness } from '@/lib/geography';
import type { Outage } from '@/lib/types';
import IslandMap from '@/components/IslandMap';
import MapLegend from '@/components/MapLegend';
import HomeOutages from '@/components/HomeOutages';
import OutageCard from '@/components/OutageCard';
import Countdown from '@/components/Countdown';
import AdSlot from '@/components/AdSlot';
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
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  // Title and description come from the layout; the district filter lives in
  // the query string and the canonical points past it.
  return pageMetadata({ locale, dict: await getDictionary(locale) });
}

export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const now = await getNow();
  const [outages, freshness] = await Promise.all([getOutages(now), getFreshness(now)]);

  const byStart = (a: Outage, b: Outage) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const active = outages.filter((o) => deriveStatus(o, now) === 'active').sort(byStart);
  const upcoming = outages.filter((o) => deriveStatus(o, now) === 'upcoming').sort(byStart);
  const activeDistricts = new Set(active.map((o) => o.district));

  // The full list, every district. The ?district narrowing is applied in the
  // browser (components/HomeOutages.tsx) — the page is cached and shared, so
  // the server no longer reads the query string.
  const list = [...active, ...upcoming];

  const numberFormat = new Intl.NumberFormat(locale);
  const heroTitle =
    activeDistricts.size === 0
      ? dict.hero.allClear
      : activeDistricts.size === 1
        ? dict.hero.oneOut(DISTRICTS[[...activeDistricts][0]].name)
        : fill(dict.hero.manyOut, { count: numberFormat.format(activeDistricts.size) });
  const next = upcoming[0];
  // The headline says how many districts are dark; this names them and says
  // what kind of outage each one is, which is the part a reader acts on — a
  // fault might end any minute, announced work will not.
  //
  // Every active record is listed rather than a capped few: across the stored
  // archive four at once is the worst it has ever been, and a bad day honestly
  // costs a longer line.
  const kindWord = {
    planned: dict.hero.kindPlanned,
    fault: dict.hero.kindFault,
    rotating: dict.hero.kindRotating,
  };
  const activeSummary = active
    .map((outage) => dict.hero.activeItem(DISTRICTS[outage.district].name, kindWord[outage.kind]))
    .join(' · ');

  const geometry = getMapGeometry();
  // The map is handed finished sentences rather than records: the locale, the
  // clock and the dictionary all live here, and the popover only has to print.
  const lampOutages = Object.fromEntries(
    [...resolveDarkness(active, geometry.settlements)].map(([name, o]) => [
      name,
      { kind: dict.kind[o.kind], when: formatTimeRange(o, locale, dict), source: o.source },
    ]),
  );

  // Places the day took out and gave back (§3.3). Not the same question as the
  // map's live state, and nothing else on the page answers it: the cards are a
  // list, and only the island can say where the day's outages were.
  // `getOutages` already reaches thirty days back, so the day behind us is in
  // hand and this costs no extra query.
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const embers = [
    ...new Set(
      outages
        .filter((o) => readEndOf(o) >= dayAgo && Date.parse(o.startsAt) <= now)
        .flatMap((o) => [...resolveDarkness([o], geometry.settlements).keys()]),
    ),
  ].filter((name) => !lampOutages[name]);

  // The structured list always describes the whole island: the canonical URL
  // points past the query string, so the filtered variants are the same page.
  const listTitle = dict.list.titleAll;

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
        {/* Prose, so sans (§2.2): the mono face carries data, and a sentence set
          * in it ran to three lines on a phone. The countdown inside stays mono. */}
        <p className="mb-0 mt-1 max-w-[52ch] text-pretty text-small text-muted">
          {/* 'Nothing announced' is only true when nothing is running either.
            * Printed on the strength of an empty upcoming list alone it would
            * sit directly under a headline saying the power is out. */}
          {active.length === 0 && !next ? (
            dict.hero.noneAtAll
          ) : (
            <>
              {activeSummary}
              {activeSummary && next && ' · '}
              {/* No "nothing else announced" tail. Once the line has named what
                * is out, the absence of a follow-up is not news, and reaching
                * here with nothing active is impossible — that is the branch
                * above. */}
              {next && (
                <>
                  {fill(dict.hero.nextPrefix, {
                    district: DISTRICTS[next.district].name,
                    time: formatClock(next.startsAt, locale),
                  })}
                  <span className="font-mono">
                    <Countdown
                      targetIso={next.startsAt}
                      pattern={dict.countdown.plain}
                      units={{ day: dict.time.day, hour: dict.time.hour, minute: dict.time.minute }}
                      initialNow={now}
                    />
                  </span>
                </>
              )}
              {/* A fault is running somewhere: the number is one tap away
                * here, not three pages into the guides. */}
              {active.some((o) => o.kind === 'fault') && (
                <>
                  {' · '}
                  <a
                    href={`tel:${dict.emergency.number}`}
                    className="whitespace-nowrap font-mono text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
                  >
                    {dict.emergency.label} {dict.emergency.number}
                  </a>
                </>
              )}
            </>
          )}
        </p>
      </section>

      {/* What a point is, and what its colour means — above the map rather
        * than below it, because it is the reader's first look at two hundred
        * unlabelled dots that needs the sentence, not their second. */}
      <section className="pt-4">
        <MapLegend
          lead={dict.map.legendLead}
          powerOn={dict.map.powerOn}
          powerOut={dict.map.powerOut}
          backToday={dict.map.backToday}
        />
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
          embers={embers}
          hour={islandHour(now)}
          locale={locale}
          strings={{
            ariaLabel: dict.map.ariaLabel,
            hint: dict.map.hint,
            powerOn: dict.map.powerOn,
            powerOut: dict.map.powerOut,
            pointAria: dict.map.pointAria,
            districtAria: dict.map.districtAria,
            backToday: dict.map.backToday,
          }}
        />
      </section>

      <HomeOutages
        basePath={routeHref(locale)}
        locale={locale}
        firstBlock={FIRST_BLOCK}
        districts={DISTRICT_IDS.map((id) => ({ id, name: DISTRICTS[id].name }))}
        strings={{
          titleAll: dict.list.titleAll,
          titleDistrict: dict.list.titleDistrict,
          sorted: dict.list.sorted,
          filterAriaLabel: dict.filter.ariaLabel,
          filterAll: dict.filter.all,
        }}
        items={list.map((outage) => ({
          id: outage.id,
          district: outage.district,
          node: (
            <OutageCard
              outage={outage}
              status={deriveStatus(outage, now)}
              locale={locale}
              dict={dict}
              now={now}
            />
          ),
        }))}
        adSlot={
          // After the first block of cards, never before one, and never
          // while the data is stale (§11.3).
          <AdSlot slot="home-mid" label={dict.ad.label} suppressed={freshness.stale} />
        }
        emptyNode={
          <div className="flex flex-col gap-2 rounded-[4px] border border-dark px-5 py-6">
            <p className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.list.empty}</p>
            <p className="m-0 font-mono text-meta text-muted">
              {freshness.lastCheckedAt
                ? fill(dict.list.checkedAsOf, { time: formatClock(freshness.lastCheckedAt, locale) })
                : dict.statusBar.neverChecked}
            </p>
          </div>
        }
      />

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
