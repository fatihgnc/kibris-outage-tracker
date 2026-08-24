import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getGuideIndex } from '@/lib/content';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/jsonld';
import JsonLd from '@/components/JsonLd';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return pageMetadata({
    locale,
    dict,
    path: '/guides',
    title: dict.guides.title,
    description: dict.guides.lead,
  });
}

// Index of the written explainers (§5.4). No outage cards on these pages.
export default async function GuidesPage({ params }: Props) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);
  const guides = await getGuideIndex(locale);

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: dict.guides.title, path: `/${locale}/guides` },
        ])}
      />

      <section className="pt-5">
        <h1 className="opsz-120 m-0 font-display text-display font-semibold tracking-[-0.02em] text-text">
          {dict.guides.title}
        </h1>
        <p className="mb-0 mt-2 max-w-[52ch] text-pretty text-small text-muted">{dict.guides.lead}</p>
      </section>

      <section className="pt-6">
        <ul className="m-0 list-none border-t border-dark p-0">
          {guides.map((guide) => (
            <li key={guide.slug} className="border-b border-dark">
              <Link
                href={`/${locale}/guides/${guide.slug}`}
                className="group flex flex-col gap-1 py-4 no-underline"
              >
                <span className="opsz-24 font-display text-body font-semibold text-text group-hover:text-lamp">
                  {guide.title}
                </span>
                <span className="max-w-[62ch] text-pretty text-small text-muted">{guide.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
