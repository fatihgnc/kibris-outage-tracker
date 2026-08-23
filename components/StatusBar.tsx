import { Suspense } from 'react';
import type { Outage } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { fill } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import type { Freshness } from '@/lib/data';
import { deriveStatus, formatClock, formatDateTimeShort } from '@/lib/time';
import { DISTRICTS } from '@/lib/geography';
import LocaleSwitcher from './LocaleSwitcher';

type Props = {
  locale: Locale;
  dict: Dictionary;
  outages: Outage[];
  now: number;
  freshness: Freshness;
};

// One line at the top of every page: current overall state on the left, last
// check time and the language switcher on the right (§6.6). When the data is
// stale a plain note follows it — serving stale data without saying it is
// stale is worse than an honest gap (§10.7).
export default function StatusBar({ locale, dict, outages, now, freshness }: Props) {
  const { lastCheckedAt, stale } = freshness;
  const active = outages.filter((o) => deriveStatus(o, now) === 'active');
  const activeDistricts = [...new Set(active.map((o) => o.district))];
  const faultActive = active.some((o) => o.kind === 'fault');

  const dotColor = stale ? 'bg-muted' : active.length === 0 ? 'bg-lamp' : faultActive ? 'bg-fault' : 'bg-dark';
  const text =
    active.length === 0
      ? dict.statusBar.allClear
      : activeDistricts.length === 1
        ? dict.statusBar.oneActive(DISTRICTS[activeDistricts[0]].name)
        : fill(dict.statusBar.manyActive, {
            count: new Intl.NumberFormat(locale).format(activeDistricts.length),
          });

  return (
    <div className="sticky top-0 z-10 border-b border-dark bg-night">
      <div className="mx-auto flex w-full max-w-[1060px] items-center justify-between gap-3 px-5 py-2">
        <p className="m-0 flex min-w-0 items-center gap-2 text-small text-text">
          <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${dotColor}`} />
          <span>{text}</span>
        </p>
        <div className="flex flex-none items-center gap-3">
          <span className="whitespace-nowrap font-mono text-meta text-muted">
            {lastCheckedAt
              ? fill(dict.statusBar.checked, { time: formatClock(lastCheckedAt, locale) })
              : dict.statusBar.neverChecked}
          </span>
          <Suspense fallback={null}>
            <LocaleSwitcher locale={locale} labels={dict.switcher} />
          </Suspense>
        </div>
      </div>

      {stale && (
        <div role="status" className="border-t border-dark">
          <div className="mx-auto w-full max-w-[1060px] px-5 py-2">
            <p className="m-0 max-w-[80ch] text-pretty text-meta text-muted">
              <span className="text-text">{dict.statusBar.staleTitle}</span>{' '}
              {lastCheckedAt
                ? fill(dict.statusBar.staleBody, { time: formatDateTimeShort(lastCheckedAt, locale) })
                : dict.statusBar.staleNeverBody}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
