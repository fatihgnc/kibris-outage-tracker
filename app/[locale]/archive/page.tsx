import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getArchivedOutages, getNow } from '@/lib/data';
import { deriveStatus, formatDateLong, formatMonthYear, monthKey } from '@/lib/time';
import { DISTRICTS, isDistrictId } from '@/lib/geography';
import type { ArchivedOutage, DistrictId } from '@/lib/types';
import DistrictFilter from '@/components/DistrictFilter';
import ArchiveMonthSelect from '@/components/ArchiveMonthSelect';
import OutageCard from '@/components/OutageCard';
import AdSlot from '@/components/AdSlot';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonld';
import { routeHref } from '@/lib/routes';
import { addressable } from '@/lib/slug';
import { groupSiblings } from '@/lib/events';
import JsonLd from '@/components/JsonLd';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ district?: string | string[]; month?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  // The district and month filters are query parameters, so every combination
  // canonicalises back to the bare archive.
  return pageMetadata({
    locale,
    dict,
    href: (l) => routeHref(l, 'archive'),
    title: dict.meta.archiveTitle,
    description: dict.meta.archiveDescription,
  });
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
    .sort((a: ArchivedOutage, b: ArchivedOutage) => Date.parse(b.startsAt) - Date.parse(a.startsAt));

  const monthKeys = [...new Set(past.map((o) => monthKey(o.startsAt)))];
  const selectedMonth = monthRaw && monthKeys.includes(monthRaw) ? monthRaw : null;

  const filtered = past.filter(
    (o) =>
      (!selectedDistrict || o.district === selectedDistrict) &&
      (!selectedMonth || monthKey(o.startsAt) === selectedMonth),
  );

  // One announcement filed under several districts is one card, led by its
  // latest reading (lib/events.ts) — except under a district filter, where
  // the reader asked for that district's records and gets each as filed.
  const cards = selectedDistrict
    ? filtered.map((record) => ({ lead: record, siblings: [] }))
    : groupSiblings(filtered);

  // Flat chronological list, grouped by month.
  const groups: { month: string; records: typeof cards }[] = [];
  for (const card of cards) {
    const key = monthKey(card.lead.startsAt);
    const group = groups.find((g) => g.month === key);
    if (group) group.records.push(card);
    else groups.push({ month: key, records: [card] });
  }

  const numberFormat = new Intl.NumberFormat(locale);
  const monthOptions = [
    { value: 'all', label: dict.archive.allMonths },
    ...monthKeys.map((key) => ({ value: key, label: formatMonthYear(key, locale) })),
  ];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: dict.archive.title, path: routeHref(locale, 'archive') },
        ])}
      />
      {/* The archive is a list of pages, so it is published as one. The entries
        * follow the active filter, because that is what the reader is looking
        * at — the canonical still points past the query string (lib/seo.ts). */}
      {filtered.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            dict.archive.title,
            addressable(filtered).map(({ record, slug }) => ({
              name: dict.meta.outageTitle(
                DISTRICTS[record.district].name,
                formatDateLong(record.startsAt, locale),
              ),
              path: routeHref(locale, 'outage', slug),
            })),
          )}
        />
      )}

      <section className="pt-5">
        <h1 className="opsz-120 m-0 font-display text-display font-semibold tracking-[-0.02em] text-text">
          {dict.archive.title}
        </h1>
        <p className="mb-0 mt-2 max-w-[46ch] text-pretty text-small text-muted">{dict.archive.lead}</p>
      </section>

      <section className="flex flex-col gap-4 pt-4">
        <DistrictFilter
          dict={dict}
          selected={selectedDistrict}
          basePath={routeHref(locale, 'archive')}
          extraQuery={selectedMonth ? { month: selectedMonth } : {}}
        />
        <ArchiveMonthSelect
          value={selectedMonth ?? 'all'}
          options={monthOptions}
          label={dict.archive.monthLabel}
          basePath={routeHref(locale, 'archive')}
          preserve={selectedDistrict ? { district: selectedDistrict } : {}}
        />
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
                  {group.records.map(({ lead, siblings }) => (
                    <li key={lead.id}>
                      <OutageCard
                        outage={lead}
                        status="past"
                        locale={locale}
                        dict={dict}
                        now={now}
                        compact
                        cancelled={lead.cancelled}
                        siblings={siblings}
                      />
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

      {/* The archive carries at most one unit, near the bottom, and none on an
       * empty result — that is already a poorly served moment (§11.3). */}
      {groups.length > 0 && <AdSlot slot="archive-foot" label={dict.ad.label} />}
    </>
  );
}
