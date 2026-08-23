import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getArchivedOutages, getNow } from '@/lib/data';
import { deriveStatus, formatMonthYear, monthKey } from '@/lib/time';
import { isDistrictId } from '@/lib/geography';
import type { DistrictId, Outage } from '@/lib/types';
import DistrictFilter from '@/components/DistrictFilter';
import ArchiveMonthSelect from '@/components/ArchiveMonthSelect';
import OutageCard from '@/components/OutageCard';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ district?: string | string[]; month?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return {
    title: dict.meta.archiveTitle,
    description: dict.meta.archiveDescription,
    alternates: {
      languages: { tr: '/tr/archive', en: '/en/archive', 'x-default': '/tr/archive' },
    },
  };
}

export default async function ArchivePage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);

  const sp = await searchParams;
  const selectedDistrict: DistrictId | null =
    typeof sp.district === 'string' && isDistrictId(sp.district) ? sp.district : null;
  const monthRaw = typeof sp.month === 'string' ? sp.month : null;

  const now = await getNow();
  const outages = await getArchivedOutages(now);
  const past = outages
    .filter((o) => deriveStatus(o, now) === 'past')
    .sort((a: Outage, b: Outage) => Date.parse(b.startsAt) - Date.parse(a.startsAt));

  const monthKeys = [...new Set(past.map((o) => monthKey(o.startsAt)))];
  const selectedMonth = monthRaw && monthKeys.includes(monthRaw) ? monthRaw : null;

  const filtered = past.filter(
    (o) =>
      (!selectedDistrict || o.district === selectedDistrict) &&
      (!selectedMonth || monthKey(o.startsAt) === selectedMonth),
  );

  // Flat chronological list, grouped by month.
  const groups: { month: string; records: Outage[] }[] = [];
  for (const outage of filtered) {
    const key = monthKey(outage.startsAt);
    const group = groups.find((g) => g.month === key);
    if (group) group.records.push(outage);
    else groups.push({ month: key, records: [outage] });
  }

  const numberFormat = new Intl.NumberFormat(locale);
  const monthOptions = [
    { value: 'all', label: dict.archive.allMonths },
    ...monthKeys.map((key) => ({ value: key, label: formatMonthYear(key, locale) })),
  ];

  return (
    <>
      <section className="pt-5">
        <h1 className="opsz-120 m-0 font-display text-display font-semibold tracking-[-0.02em] text-text">
          {dict.archive.title}
        </h1>
        <p className="mb-0 mt-2 max-w-[46ch] text-pretty text-small text-muted">{dict.archive.lead}</p>
      </section>

      <section className="flex flex-col gap-3 pt-4">
        <DistrictFilter
          locale={locale}
          dict={dict}
          selected={selectedDistrict}
          basePath="/archive"
          extraQuery={selectedMonth ? { month: selectedMonth } : {}}
        />
        <Suspense fallback={null}>
          <ArchiveMonthSelect
            value={selectedMonth ?? 'all'}
            options={monthOptions}
            label={dict.archive.monthLabel}
          />
        </Suspense>
      </section>

      <section className="pt-5">
        <p className="m-0 mb-3 font-mono text-meta text-muted">
          {fill(dict.archive.count, { count: numberFormat.format(filtered.length) })}
        </p>
        {groups.length > 0 ? (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.month}>
                <h2 className="opsz-40 m-0 mb-2.5 font-display text-h2 font-semibold text-text">
                  {formatMonthYear(group.month, locale)}
                </h2>
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {group.records.map((outage) => (
                    <li key={outage.id}>
                      <OutageCard outage={outage} status="past" locale={locale} dict={dict} now={now} compact />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-[4px] border border-dark p-5">
            <p className="m-0 text-body text-text">{dict.archive.empty}</p>
          </div>
        )}
      </section>
    </>
  );
}
