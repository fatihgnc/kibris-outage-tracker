import Link from 'next/link';
import type { Outage } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { fill } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { deriveStatus, formatDateTimeShort } from '@/lib/time';
import { DISTRICT_IDS, DISTRICTS } from '@/lib/geography';
import { routeHref } from '@/lib/routes';

type Props = {
  outages: Outage[];
  now: number;
  locale: Locale;
  dict: Dictionary;
};

// Six rows: a dot, the district's name as the link to its page, and one line
// saying what is happening there. The dot follows the status bar's rule
// exactly — lit when quiet, fault red when a fault is running, dark when
// the running outage is planned — so the two never disagree about a colour.
export default function DistrictList({ outages, now, locale, dict }: Props) {
  const kindWord = {
    planned: dict.hero.kindPlanned,
    fault: dict.hero.kindFault,
    rotating: dict.hero.kindRotating,
  };
  const rows = DISTRICT_IDS.map((id) => {
    const here = outages.filter((o) => o.district === id);
    const active = here.filter((o) => deriveStatus(o, now) === 'active');
    const next = here
      .filter((o) => deriveStatus(o, now) === 'upcoming')
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    const fault = active.some((o) => o.kind === 'fault');
    // A fault outranks planned work in the one word the row has room for.
    const kind = fault ? 'fault' : active[0]?.kind;
    const state = kind
      ? fill(dict.districts.active, { kind: kindWord[kind] })
      : next
        ? fill(dict.districts.next, { time: formatDateTimeShort(next.startsAt, locale) })
        : dict.districts.quiet;
    const dot = active.length === 0 ? 'bg-lamp' : fault ? 'bg-fault' : 'bg-dark';
    return { id, name: DISTRICTS[id].name, state, dot, out: active.length > 0 };
  });

  return (
    <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-x-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <li key={row.id} className="border-b border-dark">
          <Link
            href={routeHref(locale, 'district', row.id)}
            className="flex min-h-11 items-center gap-3 py-2 no-underline"
          >
            <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${row.dot}`} />
            <span className="opsz-24 font-display text-body font-semibold text-text">{row.name}</span>
            <span className={`ml-auto text-right font-mono text-meta ${row.out ? 'text-text' : 'text-muted'}`}>
              {row.state}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
