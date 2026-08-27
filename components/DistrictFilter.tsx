import Link from 'next/link';
import type { DistrictId } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { DISTRICT_IDS, DISTRICTS } from '@/lib/geography';

type Props = {
  dict: Dictionary;
  selected: DistrictId | null;
  // The page the chips filter, locale segment included: routeHref(locale) for
  // the home page, routeHref(locale, 'archive') for the archive.
  basePath: string;
  // Query parameters to preserve when switching district (e.g. archive month).
  extraQuery?: Record<string, string>;
};

// Selection lives in the URL query so the view is shareable — never in
// localStorage. Chips are real links and work without JavaScript.
export default function DistrictFilter({ dict, selected, basePath, extraQuery = {} }: Props) {
  const chips: { id: DistrictId | null; name: string }[] = [
    { id: null, name: dict.filter.all },
    ...DISTRICT_IDS.map((id) => ({ id: id as DistrictId | null, name: DISTRICTS[id].name })),
  ];
  const hrefFor = (id: DistrictId | null) => {
    const query = new URLSearchParams(extraQuery);
    if (id) query.set('district', id);
    const qs = query.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };

  return (
    <nav aria-label={dict.filter.ariaLabel}>
      <ul className="no-scrollbar m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
        {chips.map((chip) => {
          const active = selected === chip.id;
          return (
            <li key={chip.id ?? 'all'} className="flex-none">
              <Link
                href={hrefFor(chip.id)}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex min-h-11 items-center rounded-[2px] border px-4 text-small no-underline ${
                  active ? 'border-lamp text-lamp' : 'border-dark text-text hover:border-lamp'
                }`}
              >
                {chip.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
