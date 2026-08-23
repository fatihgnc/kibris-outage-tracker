'use client';

import { useState } from 'react';
import type { MonthlyTotal } from '@/lib/types';
import { fill as fillTemplate } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/config';
import { formatMonthShort, formatMonthYear } from '@/lib/time';

type Props = {
  totals: MonthlyTotal[];
  locale: Locale;
  strings: {
    ariaLabel: string;
    legendPlanned: string;
    legendFault: string;
    detail: string; // {month} {planned} {fault}
    detailHint: string;
    monthAria: string; // {month} {planned} {fault}
    hourUnit: string;
  };
};

const MAX_BAR_PX = 118;

// Twelve-month stacked bar chart (§6.5). The absolute value printed above the
// tallest bar anchors the magnitude; hover and keyboard focus reveal each
// month's figures in the detail line below.
export default function HistoryChart({ totals, locale, strings }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const numberFormat = new Intl.NumberFormat(locale);
  const max = Math.max(...totals.map((t) => t.plannedHours + t.faultHours), 1);
  const active = activeIndex === null ? null : totals[activeIndex];

  return (
    <div role="group" aria-label={strings.ariaLabel}>
      <div className="flex h-[150px] w-full items-end gap-2 border-b border-dark">
        {totals.map((month, i) => {
          const total = month.plannedHours + month.faultHours;
          return (
            <button
              key={month.month}
              type="button"
              aria-label={fillTemplate(strings.monthAria, {
                month: formatMonthYear(month.month, locale),
                planned: numberFormat.format(month.plannedHours),
                fault: numberFormat.format(month.faultHours),
              })}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              className="flex h-full min-w-0 flex-1 cursor-default flex-col justify-end gap-0.5 border-0 bg-transparent p-0"
            >
              <span className="block h-[18px] whitespace-nowrap text-center font-mono text-meta text-text">
                {total === max ? `${numberFormat.format(total)} ${strings.hourUnit}` : ''}
              </span>
              <span
                aria-hidden
                className="block w-full bg-fault"
                style={{ height: `${Math.round((month.faultHours / max) * MAX_BAR_PX)}px` }}
              />
              <span
                aria-hidden
                className="block w-full bg-dark"
                style={{ height: `${Math.round((month.plannedHours / max) * MAX_BAR_PX)}px` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {totals.map((month) => (
          <span key={month.month} className="min-w-0 flex-1 text-center font-mono text-meta text-muted">
            {formatMonthShort(month.month, locale)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-meta text-muted">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 bg-dark" />
          {strings.legendPlanned}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 bg-fault" />
          {strings.legendFault}
        </span>
      </div>
      <p aria-live="polite" className="m-0 mt-2 min-h-[18px] font-mono text-meta text-muted">
        {active
          ? fillTemplate(strings.detail, {
              month: formatMonthYear(active.month, locale),
              planned: numberFormat.format(active.plannedHours),
              fault: numberFormat.format(active.faultHours),
            })
          : strings.detailHint}
      </p>
    </div>
  );
}
