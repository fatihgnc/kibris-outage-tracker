import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getPage } from '@/lib/content';

// about, privacy and terms differ only by which content file they render, so
// they share this. No ad units on these pages.
export type LegalSlug = 'about' | 'privacy' | 'terms';

export async function legalMetadata(slug: LegalSlug, rawLocale: string): Promise<Metadata> {
  if (!isLocale(rawLocale)) return {};
  const page = await getPage(slug, rawLocale);
  if (!page) return {};
  return {
    title: page.title,
    description: page.summary,
    alternates: {
      languages: { tr: `/tr/${slug}`, en: `/en/${slug}`, 'x-default': `/tr/${slug}` },
    },
  };
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
    <article className="mx-auto w-full max-w-[880px]">
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
