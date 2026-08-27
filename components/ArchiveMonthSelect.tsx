'use client';

import { useRouter } from 'next/navigation';

type Props = {
  value: string; // 'all' or 'YYYY-MM'
  options: { value: string; label: string }[];
  label: string;
  /** Where the month is written to, e.g. `/tr/archive`. */
  basePath: string;
  /** Query the month filter must not drop — the district, when one is chosen. */
  preserve?: Record<string, string>;
};

// Writes the month filter to the URL query so the filtered view is shareable.
//
// The current query arrives as a prop rather than through useSearchParams().
// That hook opts its subtree out of server rendering, and the <Suspense>
// boundary it then needs never resolved: the whole control stayed parked in
// React's hidden streaming container, outside <main>, at zero by zero pixels.
// The archive had a month filter nobody could see, in dev and in production
// both. The page already knows the query, so it simply passes it down.
export default function ArchiveMonthSelect({ value, options, label, basePath, preserve = {} }: Props) {
  const router = useRouter();

  const onChange = (next: string) => {
    const query = new URLSearchParams(preserve);
    if (next !== 'all') query.set('month', next);
    const qs = query.toString();
    router.replace(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const chosen = value !== 'all';

  return (
    <label className="flex w-full flex-col items-start gap-1.5 sm:w-auto">
      <span className="font-mono text-meta text-muted">{label}</span>
      {/* The select is drawn like the district chips above it — same height,
       * same border, same lamp accent once a month is chosen — so the two
       * filters read as one control rather than two unrelated widgets. The
       * native arrow is replaced with a chevron that keeps its distance from
       * the border. */}
      <span className="relative inline-flex w-full sm:w-auto">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`min-h-11 w-full min-w-0 cursor-pointer appearance-none rounded-[2px] border bg-night py-2 pl-4 pr-11 font-mono text-small sm:w-auto sm:min-w-[13rem] ${
            chosen ? 'border-lamp text-lamp' : 'border-dark text-text hover:border-lamp'
          }`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-night text-text">
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 10 6"
          className={`pointer-events-none absolute right-4 top-1/2 h-[6px] w-2.5 -translate-y-1/2 ${
            chosen ? 'text-lamp' : 'text-muted'
          }`}
        >
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
        </svg>
      </span>
    </label>
  );
}
