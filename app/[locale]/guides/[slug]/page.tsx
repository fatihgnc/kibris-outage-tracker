import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, locales, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getGuide } from '@/lib/content';
import { GUIDE_SLUGS, guideHref, isGuideSlug, routeHref } from '@/lib/routes';
import AdSlot from '@/components/AdSlot';
import JsonLd from '@/components/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/jsonld';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isGuideSlug(slug)) return {};
  const guide = await getGuide(slug, locale);
  if (!guide) return {};
  return pageMetadata({
    locale,
    dict: await getDictionary(locale),
    href: (l) => guideHref(l, slug),
    title: guide.title,
    description: guide.summary,
    type: 'article',
  });
}

export function generateStaticParams() {
  return locales.flatMap((locale) => GUIDE_SLUGS.map((slug) => ({ locale, slug })));
}

export default async function GuidePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  if (!isLocale(rawLocale) || !isGuideSlug(slug)) notFound();
  const locale: Locale = rawLocale;
  const dict = await getDictionary(locale);
  const guide = await getGuide(slug, locale);
  if (!guide) notFound();

  const updated = guide.updated
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        Date.parse(guide.updated),
      )
    : null;

  // The article is split so one ad can sit after the first section and nowhere
  // else on the page (§11.3).
  const [firstSection, ...restSections] = splitAfterFirstSection(guide.html);

  return (
    <article className="w-full">
      <JsonLd
        data={articleJsonLd({
          locale,
          dict,
          path: guideHref(locale, slug),
          title: guide.title,
          description: guide.summary,
          updated: guide.updated,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: dict.nav.home, path: `/${locale}` },
          { name: dict.guides.title, path: routeHref(locale, 'guides') },
          { name: guide.title, path: guideHref(locale, slug) },
        ])}
      />

      <header className="pt-5">
        <Link href={routeHref(locale, 'guides')} className="font-mono text-meta text-muted no-underline hover:text-text">
          ← {dict.guides.backToIndex}
        </Link>
        <h1 className="opsz-120 m-0 mt-2 max-w-[24ch] text-pretty font-display text-display font-semibold tracking-[-0.02em] text-text">
          {guide.title}
        </h1>
        {updated && (
          <p className="mb-0 mt-2 font-mono text-meta text-muted">
            {fill(dict.guides.updated, { date: updated })}
          </p>
        )}
      </header>

      <div className="prose pt-6" dangerouslySetInnerHTML={{ __html: firstSection }} />

      {restSections.length > 0 && (
        <>
          <AdSlot slot="guide-in-article" label={dict.ad.label} />
          <div className="prose" dangerouslySetInnerHTML={{ __html: restSections.join('') }} />
        </>
      )}
    </article>
  );
}

// Splits the rendered HTML at the second <h2>, so the ad lands after the first
// section rather than between a heading and its own text.
function splitAfterFirstSection(html: string): string[] {
  const headings = [...html.matchAll(/<h2\b/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  if (headings.length < 2) return [html];
  return [html.slice(0, headings[1]), html.slice(headings[1])];
}
