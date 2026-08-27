import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getPage } from '@/lib/content';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/jsonld';
import JsonLd from '@/components/JsonLd';
import { routeHref } from '@/lib/routes';

// about, privacy and terms differ only by which content file they render, so
// they share this. No ad units on these pages.
export type LegalSlug = 'about' | 'privacy' | 'terms';

export async function legalMetadata(slug: LegalSlug, rawLocale: string): Promise<Metadata> {
  if (!isLocale(rawLocale)) return {};
  const page = await getPage(slug, rawLocale);
  if (!page) return {};
  return pageMetadata({
    locale: rawLocale,
    dict: await getDictionary(rawLocale),
    href: (l) => routeHref(l, slug),
    title: page.title,
    description: page.summary,
  });
}

export default async function LegalPage({ slug, rawLocale }: { slug: LegalSlug; rawLocale: string }) {
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);
  const page = await getPage(slug, locale);
  if (!page) notFound();

  const updated = page.updated
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        Date.parse(page.updated),
      )
    : null;

  return (
    <article className="w-full">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: page.title, path: routeHref(locale, slug) },
        ])}
      />

      <header className="pt-5">
        <h1 className="opsz-120 m-0 font-display text-display font-semibold tracking-[-0.02em] text-text">
          {page.title}
        </h1>
        {updated && (
          <p className="mb-0 mt-2 font-mono text-meta text-muted">
            {fill(dict.guides.updated, { date: updated })}
          </p>
        )}
      </header>
      <div className="prose pt-6" dangerouslySetInnerHTML={{ __html: page.html }} />
    </article>
  );
}
