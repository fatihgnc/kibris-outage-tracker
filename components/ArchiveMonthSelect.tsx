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

  return (
    <label className="flex items-center gap-2.5 font-mono text-meta text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 min-w-0 rounded-[2px] border border-dark bg-night px-3 py-2 font-mono text-small text-text"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
