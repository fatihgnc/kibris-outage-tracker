'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { fill } from '@/lib/i18n/dictionaries';
import FilterChips from './FilterChips';

type Item = {
  id: string;
  // A plain string rather than DistrictId: importing lib/geography here would
  // pull the island's geometry into the client bundle for a comparison key.
  district: string;
  node: ReactNode;
};

type Props = {
  // Server-rendered cards, active first — the full list, unfiltered. The page
  // is cached and shared, so the HTML carries every district and the narrowing
  // to one is this component's client-side job.
  items: Item[];
  districts: { id: string; name: string }[];
  strings: {
    titleAll: string;
    titleDistrict: string; // {district}
    sorted: string; // {count}
    filterAriaLabel: string;
    filterAll: string;
  };
  basePath: string;
  locale: string;
  firstBlock: number;
  adSlot: ReactNode;
  emptyNode: ReactNode;
};

const GRID = 'm-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3';

// The district filter used to live in searchParams and be applied on the
// server, which made every request its own render. The selection still lives
// in the URL — the view stays shareable — but it is read and applied here,
// after hydration, so the page itself can be served from cache. First paint
// therefore always shows the full island; a shared ?district link narrows a
// beat later. Without JavaScript the chips navigate for real and land on the
// full list: a reader without the script loses the narrowing, never the data.
export default function HomeOutages({
  items,
  districts,
  strings,
  basePath,
  locale,
  firstBlock,
  adSlot,
  emptyNode,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const district = new URLSearchParams(window.location.search).get('district');
      setSelected(district && districts.some((d) => d.id === district) ? district : null);
    };
    read();
    // Back and forward move through filter states the chips pushed.
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
    // districts is render-stable: it comes from the server as a literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (key: string) => {
    const id = key === 'all' ? null : key;
    window.history.pushState(null, '', id ? `${basePath}?district=${id}` : basePath);
    setSelected(id);
  };

  const chips = [
    { key: 'all', name: strings.filterAll, href: basePath, active: selected === null },
    ...districts.map((d) => ({
      key: d.id,
      name: d.name,
      href: `${basePath}?district=${d.id}`,
      active: selected === d.id,
    })),
  ];

  const visible = selected ? items.filter((item) => item.district === selected) : items;
  const districtName = districts.find((d) => d.id === selected)?.name;
  const title = districtName ? fill(strings.titleDistrict, { district: districtName }) : strings.titleAll;
  const count = new Intl.NumberFormat(locale).format(visible.length);

  return (
    <>
      <section className="pt-5">
        <FilterChips ariaLabel={strings.filterAriaLabel} chips={chips} onSelect={choose} />
      </section>

      <section className="pt-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="opsz-40 m-0 font-display text-h2 font-semibold text-text">{title}</h2>
          <span className="font-mono text-meta text-muted">{fill(strings.sorted, { count })}</span>
        </div>
        {visible.length > 0 ? (
          <>
            <ul className={GRID}>
              {visible.slice(0, firstBlock).map((item) => (
                <li key={item.id}>{item.node}</li>
              ))}
            </ul>
            {visible.length > firstBlock && (
              <>
                {/* After the first block of cards, never before one (§11.3). */}
                {adSlot}
                <ul className={GRID}>
                  {visible.slice(firstBlock).map((item) => (
                    <li key={item.id}>{item.node}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          emptyNode
        )}
      </section>
    </>
  );
}
