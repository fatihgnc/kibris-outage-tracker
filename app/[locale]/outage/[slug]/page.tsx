import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary, type Dictionary } from '@/lib/i18n/dictionaries';
import { getAreaKeyCounts, getDistrictOutages, getNow, getOutageByIdPrefix } from '@/lib/data';
import { deriveStatus, formatDateLong, formatDayLabel, formatDuration, formatTimeRange } from '@/lib/time';
import { DISTRICTS } from '@/lib/geography';
import { findEligiblePlace } from '@/lib/places';
import { outageIdPrefix, outageSlug, placeSlug } from '@/lib/slug';
import { labelSources } from '@/lib/sources';
import { routeHref } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, specialAnnouncementJsonLd } from '@/lib/jsonld';
import type { ArchivedOutage } from '@/lib/types';
import JsonLd from '@/components/JsonLd';
import KindBadge from '@/components/KindBadge';
import Countdown from '@/components/Countdown';
import OutageCard from '@/components/OutageCard';

type Props = { params: Promise<{ locale: string; slug: string }> };

// generateMetadata and the page body both need the record, and Next calls them
// separately. Without this the page would run the same lookup twice per view.
const loadOutage = cache(async (slug: string): Promise<ArchivedOutage | null> => {
  const prefix = outageIdPrefix(slug);
  if (!prefix) return null;
  return getOutageByIdPrefix(await getNow(), prefix);
});

// What the page says about itself, in one place: the heading, the <title> and
// the announcement's structured data all read from this.
function describe(outage: ArchivedOutage, locale: Locale, dict: Dictionary) {
  const districtName = DISTRICTS[outage.district].name;
  const date = formatDateLong(outage.startsAt, locale);
  return {
    districtName,
    title: dict.meta.outageTitle(districtName, date),
    description: dict.meta.outageDescription(date, outage.areas.join(', ')),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const outage = await loadOutage(slug);
  if (!outage) return {};
  const dict = await getDictionary(locale);
  const { title, description } = describe(outage, locale, dict);
  // Built from the record, not from the requested slug: the address in the bar
  // may be a stale readable half, and the canonical must name the current one.
  const canonical = outageSlug(outage);
  if (!canonical) return {};
  return pageMetadata({
    locale,
    dict,
    href: (l) => routeHref(l, 'outage', canonical),
    title,
    description,
    type: 'article',
  });
}

export default async function OutagePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const outage = await loadOutage(slug);
  if (!outage) notFound();

  // A §10.6 merge can pull `startsAt` earlier or widen `areas` after a link has
  // been shared, which changes the readable half of the address. The record is
  // still the right one — send the reader to the name it goes by now rather
  // than serving one page under two URLs.
  // Unreachable in practice — the record was found by parsing a hex prefix out
  // of the slug, so its id has one — but the page must not invent an address it
  // could not resolve again.
  const canonical = outageSlug(outage);
  if (!canonical) notFound();
  if (slug !== canonical) permanentRedirect(routeHref(locale, 'outage', canonical));

  const dict = await getDictionary(locale);
  const now = await getNow();
  const { districtName, title, description } = describe(outage, locale, dict);
  const status = deriveStatus(outage, now);
  const path = routeHref(locale, 'outage', canonical);

  const [siblings, counts] = await Promise.all([
    getDistrictOutages(now, outage.district, 13),
    getAreaKeyCounts(now),
  ]);
  const nearby = siblings.filter((other) => other.id !== outage.id).slice(0, 6);

  // A place is only linked where its page actually exists — the threshold in
  // lib/places.ts decides that, and linking past it would point at a 404.
  const areas = outage.areas.map((name) => ({
    name,
    place: findEligiblePlace(placeSlug(name), counts),
  }));

  const units = { day: dict.time.day, hour: dict.time.hour, minute: dict.time.minute };
  // Same rule as the card: a fault with no announced end counts up from its start.
  const countdown =
    status === 'active'
      ? outage.endsAt
        ? { target: outage.endsAt, pattern: dict.countdown.untilEnd, direction: 'until' as const }
        : { target: outage.startsAt, pattern: dict.countdown.sinceStart, direction: 'since' as const }
      : status === 'upcoming'
        ? { target: outage.startsAt, pattern: dict.countdown.untilStart, direction: 'until' as const }
        : null;
  // Only for a record with both ends known. A fault that was never closed has
  // no duration we can state, and the display bound is not one.
  const duration =
    outage.endsAt && status === 'past'
      ? formatDuration(Date.parse(outage.endsAt) - Date.parse(outage.startsAt), dict.time)
      : null;

  return (
    <article className="mx-auto w-full max-w-[880px]">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: districtName, path: routeHref(locale, 'district', outage.district) },
          { name: title, path },
        ])}
      />
      {/* A record that was called off is not an announcement of an outage, so
        * it is not published as one. */}
      {!outage.cancelled && (
        <JsonLd
          data={specialAnnouncementJsonLd({
            locale,
            dict,
            outage,
            districtName,
            path,
            name: title,
            text: description,
          })}
        />
      )}

      <section className="pt-4">
        <Link
          href={routeHref(locale, 'district', outage.district)}
          className="font-mono text-meta text-muted no-underline hover:text-text"
        >
          &larr; {fill(dict.outage.backToDistrict, { district: districtName })}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <KindBadge kind={outage.kind} dict={dict} />
          <span className="font-mono text-meta text-muted">
            {outage.cancelled
              ? dict.card.cancelled
              : status === 'active'
                ? dict.card.statusActive
                : status === 'upcoming'
                  ? dict.card.statusUpcoming
                  : dict.card.statusPast}
          </span>
        </div>

        <h1 className="opsz-120 m-0 mt-2 max-w-[24ch] text-pretty font-display text-display font-semibold tracking-[-0.02em] text-text">
          {title}
        </h1>
      </section>

      {/* Said before the hours, not after them: a reader who stops at the times
        * must not leave believing the outage happened (§10.6). */}
      {outage.cancelled && (
        <p className="mt-4 rounded-[4px] border border-dark px-4 py-3 text-small text-muted">
          {dict.outage.cancelled}
        </p>
      )}

      <section className="mt-5 flex flex-col gap-1 border-t border-dark pt-4">
        <time
          dateTime={outage.startsAt}
          className={`font-mono text-h2 font-medium tracking-[-0.01em] ${
            outage.cancelled ? 'text-muted line-through' : outage.kind === 'fault' ? 'text-fault' : 'text-lamp'
          }`}
        >
          {formatTimeRange(outage, locale, dict)}
        </time>
        <p className="m-0 font-mono text-small text-muted">
          {formatDayLabel(outage.startsAt, now, locale, dict)}
          {!outage.cancelled && countdown && (
            <span className="text-text">
              {' · '}
              <Countdown
                targetIso={countdown.target}
                pattern={countdown.pattern}
                units={units}
                initialNow={now}
                direction={countdown.direction}
              />
            </span>
          )}
          {!outage.cancelled && status === 'active' && !outage.endsAt && (
            <span className="text-text"> &middot; {dict.countdown.endUnknown}</span>
          )}
          {duration && <span> &middot; {fill(dict.outage.duration, { duration })}</span>}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.outage.areas}</h2>
        {/* A district-scope record holds its own district's name in `areas`, so
          * the list below would be a single link pointing at the town's page —
          * exactly the claim the record is not making, and the opposite of what
          * the map now draws. The heading stays; what sits under it becomes the
          * sentence the announcement actually supports. */}
        {outage.scope === 'district' ? (
          <p className="m-0 mt-2 max-w-[60ch] text-small text-muted">
            {fill(dict.outage.districtWide, { district: districtName })}
          </p>
        ) : (
          /* Area names come from parsed announcements, so a bad parse can put a
           * run-on token here — left to wrap on spaces alone one of those pushes
           * the page sideways on a phone. */
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 text-small">
            {areas.map(({ name, place }, index) => (
              <li key={`${name}-${index}`} className="break-words">
                {place ? (
                  <Link
                    href={routeHref(locale, 'place', place.slug)}
                    className="text-text underline decoration-dark underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="text-muted">{name}</span>
                )}
                {index < areas.length - 1 && <span className="text-muted">,</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{dict.outage.sources}</h2>
        {/* Every claim on this page traces to one of these. The site compiles
          * announcements, it does not issue them (§12). */}
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 font-mono text-small">
          {labelSources(outage.sources).map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="break-words text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
              >
                {source.label}
              </a>
              <span className="text-muted">
                {' · '}
                {source.kind === 'official' ? dict.outage.sourceOfficial : dict.outage.sourcePress}
              </span>
            </li>
          ))}
        </ul>
        {outage.confidence === 'low' && (
          <p className="m-0 mt-3 max-w-[60ch] text-small text-muted">{dict.outage.unverified}</p>
        )}
      </section>

      {nearby.length > 0 && (
        <section className="mt-8">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">
            {fill(dict.outage.nearby, { district: districtName })}
          </h2>
          <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map((other) => (
              <li key={other.id}>
                <OutageCard
                  outage={other}
                  status={deriveStatus(other, now)}
                  locale={locale}
                  dict={dict}
                  now={now}
                  compact
                  cancelled={other.cancelled}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 border-t border-dark pt-4">
        <h2 className="opsz-24 m-0 font-display text-body font-semibold text-text">{dict.outage.guides}</h2>
        <p className="m-0 mt-1 text-small text-muted">
          {dict.home.guidesLead}{' '}
          <Link
            href={routeHref(locale, 'guides')}
            className="text-text underline decoration-dark underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
          >
            {dict.home.guidesLink}
          </Link>
        </p>
      </section>
    </article>
  );
}
