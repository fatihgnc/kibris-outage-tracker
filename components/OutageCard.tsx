import Link from 'next/link';
import type { Outage, OutageStatus } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { fill } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { formatDateTimeShort, formatDayLabel, formatTimeRange } from '@/lib/time';
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
        : dict.card.statusPast;
  // One name only: the card is a summary, and the full list is on the outage's
  // own page. `sources[0]` is the most authoritative — official sources sort
  // first (ingest/dedupe.ts).
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
  const showEndUnknown = !compact && status === 'active' && !outage.endsAt;
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
          {/* The caveat belongs beside the time it qualifies, not down in the
            * footer among the provenance — the reader has already moved on by
            * then. It stays muted while the countdown next to it is not: this
            * is a note on the hours above, not a warning (§6.1). */}
          {outage.confidence === 'low' && <span> · {dict.card.unverified}</span>}
          {countdown && (
            <span className="text-text">
              {' · '}
              <Countdown targetIso={countdown.target} pattern={countdown.pattern} units={units} initialNow={now} />
            </span>
          )}
          {showEndUnknown && <span className="text-text"> · {dict.countdown.endUnknown}</span>}
        </p>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-dark pt-2">
        <p className="opsz-24 m-0 font-display text-body font-semibold text-text">
          {DISTRICTS[outage.district].name}
        </p>
        {/* Area names come from parsed announcements, so a bad parse can put a
          * run-on token here. Left to wrap on spaces alone, one of those widens
          * the grid column and pushes the whole page sideways on a phone. */}
        <p className="m-0 break-words text-small text-muted">{outage.areas.join(', ')}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-meta text-muted">
        <span>{fill(dict.card.published, { time: formatDateTimeShort(outage.publishedAt, locale) })}</span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="break-words text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
        >
          {source.name}
        </a>
      </div>
    </article>
  );
}
