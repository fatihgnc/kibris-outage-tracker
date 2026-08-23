import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getLastCheckedAt, getNow, getOutages } from '@/lib/data';
import { deriveStatus, formatClock } from '@/lib/time';
import { DISTRICTS, getMapGeometry, isDistrictId } from '@/lib/geography';
import type { DistrictId, Outage } from '@/lib/types';
import IslandMap from '@/components/IslandMap';
import DistrictFilter from '@/components/DistrictFilter';
import OutageCard from '@/components/OutageCard';
import Countdown from '@/components/Countdown';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ district?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    alternates: {
      languages: { tr: '/tr', en: '/en', 'x-default': '/tr' },
    },
  };
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
  const [outages, lastCheckedAt] = await Promise.all([getOutages(now), getLastCheckedAt(now)]);

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
  const points = geometry.points.map((p) => ({
    ...p,
    districtName: DISTRICTS[p.district].name,
    out: activeDistricts.has(p.district),
  }));

  const listTitle = selectedDistrict
    ? fill(dict.list.titleDistrict, { district: DISTRICTS[selectedDistrict].name })
    : dict.list.titleAll;

  return (
    <>
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
          islandPath={geometry.islandPath}
          northPath={geometry.northPath}
          points={points}
          locale={locale}
          strings={{
            ariaLabel: dict.map.ariaLabel,
            hint: dict.map.hint,
            powerOn: dict.map.powerOn,
            powerOut: dict.map.powerOut,
            pointAria: dict.map.pointAria,
          }}
        />
      </section>

      <section className="pt-2">
        <DistrictFilter locale={locale} dict={dict} selected={selectedDistrict} basePath="" />
      </section>

      <section className="pt-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{listTitle}</h2>
          <span className="font-mono text-meta text-muted">
            {fill(dict.list.sorted, { count: numberFormat.format(list.length) })}
          </span>
        </div>
        {list.length > 0 ? (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((outage) => (
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
        ) : (
          <div className="flex flex-col gap-2 rounded-[4px] border border-dark px-5 py-6">
            <p className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.list.empty}</p>
            <p className="m-0 font-mono text-meta text-muted">
              {fill(dict.list.checkedAsOf, { time: formatClock(lastCheckedAt, locale) })}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
