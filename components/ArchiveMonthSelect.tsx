'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Props = {
  value: string; // 'all' or 'YYYY-MM'
  options: { value: string; label: string }[];
  label: string;
};

// Writes the month filter to the URL query so the filtered view is shareable.
export default function ArchiveMonthSelect({ value, options, label }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (next: string) => {
    const query = new URLSearchParams(searchParams?.toString());
    if (next === 'all') query.delete('month');
    else query.set('month', next);
    const qs = query.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2.5 font-mono text-meta text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-[2px] border border-dark bg-night px-3 py-2 font-mono text-small text-text"
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
