import Link from 'next/link';
import type { Outage, OutageStatus } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { fill } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { formatDateTimeShort, formatDayLabel, formatTimeRange, readEndOf } from '@/lib/time';
import { DISTRICTS } from '@/lib/geography';
import { outageSlug } from '@/lib/slug';
import { routeHref } from '@/lib/routes';
import KindBadge from './KindBadge';
import Countdown from './Countdown';

type Props = {
  outage: Outage;
  status: OutageStatus;
  locale: Locale;
  dict: Dictionary;
  now: number;
  // Archive variant: smaller time block, no countdown.
  compact?: boolean;
  // Archive only: the outage was announced and then called off (§10.6). It has
  // to say so on the card — an unmarked retraction reads as an outage that
  // happened, which is the opposite of the truth.
  cancelled?: boolean;
};

export default function OutageCard({ outage, status, locale, dict, now, compact = false, cancelled = false }: Props) {
  // A cancelled outage did not happen, so its hours must not read as fact:
  // they are struck through and drop to the muted colour.
  const timeColor = cancelled ? 'text-muted line-through' : outage.kind === 'fault' ? 'text-fault' : 'text-lamp';
  const statusText =
    status === 'active'
      ? dict.card.statusActive
      : status === 'upcoming'
        ? dict.card.statusUpcoming
        : outage.endsAt
          ? fill(dict.card.endedAt, { time: formatDateTimeShort(outage.endsAt, locale) })
          : dict.card.statusPast;
  // One name only: the card is a summary, and the full list is on the outage's
  // own page. `sources[0]` is the most authoritative — official sources sort
  // first (ingest/dedupe.ts).
  // Only the 72h-backstop reading of 'past' — a fault with no announced end
  // that the site has stopped calling active — gets the caveat line. A real
  // announced end (`endedAt`, above) is not an assumption and needs none. The
  // caveat is printed, not tucked behind a tooltip: a `title` never opens on a
  // phone, which is where most readers are.
  const unconfirmedPast = status === 'past' && !cancelled && !outage.endsAt;
  const source = outage.sources[0];
  const units = { day: dict.time.day, hour: dict.time.hour, minute: dict.time.minute };
  const countdown = compact
    ? null
    : status === 'active'
      ? outage.endsAt
        ? { target: outage.endsAt, pattern: dict.countdown.untilEnd }
        : null
      : status === 'upcoming'
        ? { target: outage.startsAt, pattern: dict.countdown.untilStart }
        : null;
  // The card's own page. The time range carries the link because it is what
  // identifies the outage — the district name below it names a place that has
  // its own, different page. The card already contains a link to the source, so
  // the whole card cannot become one: anchors do not nest.
  //
  // A record with no addressable id has no page, and the time renders plain
  // rather than as a link to a 404.
  const slug = outageSlug(outage);
  const href = slug && routeHref(locale, 'outage', slug);

  return (
    <article className="flex h-full flex-col gap-2 rounded-[4px] border border-dark bg-night px-4 pb-2.5 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <KindBadge kind={outage.kind} dict={dict} />
        <span className="font-mono text-meta text-muted">{cancelled ? dict.card.cancelled : statusText}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {href ? (
          <Link href={href} className="no-underline">
            <time
              dateTime={outage.startsAt}
              className={`font-mono font-medium tracking-[-0.01em] underline decoration-transparent underline-offset-[4px] hover:decoration-current ${timeColor} ${compact ? 'text-body' : 'text-h2'}`}
            >
              {formatTimeRange(outage, locale, dict)}
            </time>
          </Link>
        ) : (
          <time
            dateTime={outage.startsAt}
            className={`font-mono font-medium tracking-[-0.01em] ${timeColor} ${compact ? 'text-body' : 'text-h2'}`}
          >
            {formatTimeRange(outage, locale, dict)}
          </time>
        )}
        <p className="m-0 font-mono text-small text-muted">
          {formatDayLabel(outage.startsAt, now, locale, dict)}
          {countdown && (
            <span className="text-text">
              {' · '}
              <Countdown targetIso={countdown.target} pattern={countdown.pattern} units={units} initialNow={now} />
            </span>
          )}
          {unconfirmedPast && (
            <span>
              {' · '}
              {fill(dict.card.assumedEnd, {
                time: formatDateTimeShort(new Date(readEndOf(outage)).toISOString(), locale),
              })}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-dark pt-2">
        <p className="opsz-24 m-0 font-display text-body font-semibold text-text">
          {DISTRICTS[outage.district].name}
        </p>
        {/* Area names come from parsed announcements, so a bad parse can put a
          * run-on token here. Left to wrap on spaces alone, one of those widens
          * the grid column and pushes the whole page sideways on a phone.
          *
          * A district-scope record has its own district's name in `areas`, so
          * printing the list would put 'Lefke' under the heading 'Lefke' and
          * read as an outage in the town — the narrow claim the record is
          * explicitly not making, and the opposite of what the map now draws. */}
        <p className="m-0 break-words text-small text-muted">
          {outage.scope === 'district' ? dict.card.districtWide : outage.areas.join(', ')}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-meta text-muted">
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="break-words text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
        >
          {source.name}
        </a>
        {/* The number to call, on the one card where a reader is looking for
          * it: a fault in progress. Planned work has nobody to report it to,
          * and a fault that is over has been reported. */}
        {status === 'active' && outage.kind === 'fault' && (
          <a
            href={`tel:${dict.emergency.number}`}
            className="whitespace-nowrap text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
          >
            {dict.emergency.label} {dict.emergency.number}
          </a>
        )}
      </div>
    </article>
  );
}
