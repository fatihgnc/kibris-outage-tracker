import type { DistrictId } from '@/lib/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { DISTRICT_IDS, DISTRICTS } from '@/lib/geography';
import FilterChips from './FilterChips';

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
  const hrefFor = (id: DistrictId | null) => {
    const query = new URLSearchParams(extraQuery);
    if (id) query.set('district', id);
    const qs = query.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
  const chips = [
    { key: 'all', name: dict.filter.all, href: hrefFor(null), active: selected === null },
    ...DISTRICT_IDS.map((id) => ({
      key: id,
      name: DISTRICTS[id].name,
      href: hrefFor(id),
      active: selected === id,
    })),
  ];

  return <FilterChips ariaLabel={dict.filter.ariaLabel} chips={chips} />;
}
