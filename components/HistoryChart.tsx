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
    legendOpen: string;
    detailOpen: string; // {open}
    detail: string; // {month} {planned} {fault}
    detailHint: string;
    monthAria: string; // {month} {planned} {fault}
    hourUnit: string;
  };
};

const MAX_BAR_PX = 118;
// The `gap-2` between the bars, in pixels. The peak figure has to line up with
// its own bar, and the gaps are a third of the row on a phone — a plain
// percentage of the width misses by half a column at the right-hand end.
const GAP_PX = 8;

// A month with hours in it must never draw as nothing: at a tall enough peak
// the proportional height rounds to zero, and a bar that isn't there reads as
// a month with no outages.
const barHeight = (hours: number, max: number) =>
  hours > 0 ? Math.max(1, Math.round((hours / max) * MAX_BAR_PX)) : 0;

// Twelve-month stacked bar chart (§6.5). The absolute value printed above the
// tallest bar anchors the magnitude; pointer, touch and keyboard focus each
// reveal a month's figures in the detail line below.
export default function HistoryChart({ totals, locale, strings }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const numberFormat = new Intl.NumberFormat(locale);
  const max = Math.max(...totals.map((t) => t.plannedHours + t.faultHours), 1);
  const active = activeIndex === null ? null : totals[activeIndex];
  const peak = totals.findIndex((t) => t.plannedHours + t.faultHours === max);

  return (
    <div role="group" aria-label={strings.ariaLabel}>
      {/* The peak figure sits in its own row rather than inside a column. On a
        * phone a column is under twenty pixels and the figure is twice that;
        * inside the column it overflowed to the right, and with the peak in
        * the last month it pushed the whole page sideways. Here it starts at
        * its own bar and the shrinkable spacer before it gives way instead, so
        * it can reach the right edge but never pass it. */}
      <div className="mb-0.5 flex h-[18px] w-full">
        <span
          aria-hidden
          className="min-w-0"
          style={{
            flex: `0 1 calc((100% - ${(totals.length - 1) * GAP_PX}px) / ${totals.length} * ${peak} + ${
              peak * GAP_PX
            }px)`,
          }}
        />
        <span className="shrink-0 whitespace-nowrap font-mono text-meta text-text">
          {numberFormat.format(max)} {strings.hourUnit}
        </span>
      </div>
      <div className="flex h-[130px] w-full items-end gap-2 border-b border-dark">
        {totals.map((month, i) => (
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
            {/* A fault with no announced end has no height to draw, so it is a
              * mark above the stack: the month is not as quiet as its bar. */}
            {month.openFaults > 0 && (
              <span aria-hidden className="mx-auto mb-0.5 h-1.5 w-1.5 rounded-full bg-fault" />
            )}
            <span
              aria-hidden
              className="block w-full bg-fault"
              style={{ height: `${barHeight(month.faultHours, max)}px` }}
            />
            <span
              aria-hidden
              className="block w-full bg-dark"
              style={{ height: `${barHeight(month.plannedHours, max)}px` }}
            />
          </button>
        ))}
      </div>
      {/* Twelve month names do not fit across a phone — each column is under
        * twenty pixels and every label loses a letter. Below `sm` only every
        * other one is drawn, counted back from the most recent month so the
        * newest is always named. The rest keep their space so the labels stay
        * under their own bars. */}
      <div className="mt-1.5 flex gap-2">
        {totals.map((month, i) => (
          <span
            key={month.month}
            className={`min-w-0 flex-1 text-center font-mono text-meta text-muted ${
              (totals.length - 1 - i) % 2 === 0 ? '' : 'invisible sm:visible'
            }`}
          >
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
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-fault" />
          {strings.legendOpen}
        </span>
      </div>
      <p aria-live="polite" className="m-0 mt-2 min-h-[18px] font-mono text-meta text-muted">
        {active
          ? [
              fillTemplate(strings.detail, {
                month: formatMonthYear(active.month, locale),
                planned: numberFormat.format(active.plannedHours),
                fault: numberFormat.format(active.faultHours),
              }),
              ...(active.openFaults > 0
                ? [fillTemplate(strings.detailOpen, { open: numberFormat.format(active.openFaults) })]
                : []),
            ].join(' · ')
          : strings.detailHint}
      </p>
    </div>
  );
}
