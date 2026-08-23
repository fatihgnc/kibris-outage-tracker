import type { Outage, OutageStatus } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { fill } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { formatDateTimeShort, formatDayLabel, formatTimeRange } from '@/lib/time';
import { DISTRICTS } from '@/lib/geography';
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
};

export default function OutageCard({ outage, status, locale, dict, now, compact = false }: Props) {
  const timeColor = outage.kind === 'fault' ? 'text-fault' : 'text-lamp';
  const statusText =
    status === 'active'
      ? dict.card.statusActive
      : status === 'upcoming'
        ? dict.card.statusUpcoming
        : dict.card.statusPast;
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

  return (
    <article className="flex h-full flex-col gap-2 rounded-[4px] border border-dark bg-night px-4 pb-2.5 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <KindBadge kind={outage.kind} dict={dict} />
        <span className="font-mono text-meta text-muted">{statusText}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <time
          dateTime={outage.startsAt}
          className={`font-mono font-medium tracking-[-0.01em] ${timeColor} ${compact ? 'text-body' : 'text-h2'}`}
        >
          {formatTimeRange(outage, locale, dict)}
        </time>
        <p className="m-0 font-mono text-small text-muted">
          {formatDayLabel(outage.startsAt, now, locale, dict)}
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
        <p className="m-0 text-small text-muted">{outage.areas.join(', ')}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-meta text-muted">
        <span>{fill(dict.card.published, { time: formatDateTimeShort(outage.publishedAt, locale) })}</span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="text-text underline decoration-muted underline-offset-[3px] hover:text-lamp hover:decoration-lamp"
        >
          {source.name}
        </a>
        {outage.confidence === 'low' && <span>{dict.card.unverified}</span>}
      </div>
    </article>
  );
}
