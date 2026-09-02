'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { foldKey } from '../ingest/parse/text';
import { routeHref } from '@/lib/routes';
import type { Locale } from '@/lib/i18n/config';

export type SearchPlace = {
  name: string;
  district: string;
  slug: string;
  hasPage: boolean;
  out: boolean;
};

type Props = {
  places: SearchPlace[];
  locale: Locale;
  districtNames: Record<string, string>;
  strings: {
    label: string;
    placeholder: string;
    empty: string;
    powerOn: string;
    powerOut: string;
  };
};

// How many rows a query gets. Six is a screen's worth on a phone; past that a
// reader types another letter.
const LIMIT = 6;

/**
 * The question the site exists for, asked by name.
 *
 * A reader knows their village. What they do not know is which of two hundred
 * unlabelled dots it is, or which district a village on a border belongs to.
 * Typing three letters answers it here — the row already says whether the
 * power is out — and a tap lands on the place's own page where it has one, or
 * on its district's.
 *
 * Matching goes through the same fold the ingest matches announcements with
 * (`foldKey`), so 'bogazici' finds Boğaziçi and 'Kucuk' finds Küçük Kaymaklı.
 * A match at the start of a word ranks above one inside it.
 */
export default function PlaceSearch({ places, locale, districtNames, strings }: Props) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);

  const folded = useMemo(() => places.map((place) => ({ place, key: foldKey(place.name) })), [places]);
  const needle = foldKey(query);
  const matches = useMemo(() => {
    if (!needle) return [];
    const starts: SearchPlace[] = [];
    const inside: SearchPlace[] = [];
    for (const { place, key } of folded) {
      if (key.startsWith(needle) || key.includes(` ${needle}`)) starts.push(place);
      else if (key.includes(needle)) inside.push(place);
    }
    return [...starts, ...inside].slice(0, LIMIT);
  }, [folded, needle]);

  const hrefOf = (place: SearchPlace) =>
    place.hasPage ? routeHref(locale, 'place', place.slug) : routeHref(locale, 'district', place.district);

  const showing = open && needle.length > 0;
  const highlighted = matches[Math.min(cursor, Math.max(matches.length - 1, 0))];

  return (
    <div className="relative max-w-[32rem]">
      <label htmlFor={`${listId}-input`} className="mb-1 block font-mono text-meta text-muted">
        {strings.label}
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={showing}
        aria-controls={`${listId}-list`}
        aria-activedescendant={showing && highlighted ? `${listId}-${highlighted.slug}` : undefined}
        placeholder={strings.placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Closed on the next tick, so a tap on a row lands before the list goes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, Math.max(matches.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (event.key === 'Enter' && showing && highlighted) {
            event.preventDefault();
            router.push(hrefOf(highlighted));
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="min-h-11 w-full rounded-[2px] border border-dark bg-night px-4 text-body text-text placeholder:text-muted focus:border-muted"
      />
      {showing && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="absolute left-0 right-0 z-10 m-0 mt-1 list-none border border-dark bg-night p-0"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-2.5 text-small text-muted">{strings.empty}</li>
          ) : (
            matches.map((place) => (
              <li
                key={place.slug}
                id={`${listId}-${place.slug}`}
                role="option"
                aria-selected={highlighted?.slug === place.slug}
                className={highlighted?.slug === place.slug ? 'bg-dark/40' : undefined}
              >
                <Link
                  href={hrefOf(place)}
                  className="flex min-h-11 items-baseline gap-3 px-4 py-2 no-underline"
                  onMouseEnter={() => setCursor(matches.indexOf(place))}
                >
                  <span className="text-body text-text">{place.name}</span>
                  <span className="font-mono text-meta text-muted">{districtNames[place.district] ?? place.district}</span>
                  <span className={`ml-auto whitespace-nowrap font-mono text-meta ${place.out ? 'text-fault' : 'text-muted'}`}>
                    {place.out ? strings.powerOut : strings.powerOn}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
