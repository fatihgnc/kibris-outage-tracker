import type { Metadata } from 'next';
import { defaultLocale, locales, type Locale } from './i18n/config';
import type { Dictionary } from './i18n/dictionaries';
import { routeHref } from './routes';

// Open Graph wants a full locale, not a language tag.
const ogLocale = (locale: Locale) => (locale === 'tr' ? 'tr_TR' : 'en_US');

type Args = {
  locale: Locale;
  dict: Dictionary;
  /**
   * This page's address in a given locale, locale segment included. A function
   * rather than a string because the path itself is translated: the canonical
   * is /tr/arsiv where the hreflang alternate is /en/archive. Defaults to the
   * home page.
   */
  href?: (locale: Locale) => string;
  title?: string;
  description?: string;
  type?: 'website' | 'article';
};

/**
 * One page's shareable identity: canonical URL, the reciprocal hreflang set
 * (§7.6), and a complete Open Graph block.
 *
 * The canonical earns its place on the two filtered pages. Home and archive
 * carry their filters in the query string (?district=, ?month=), so a crawler
 * following a filter chip lands on what is, to it, a new URL showing almost
 * the same content. Pointing every one of them back at the bare path says:
 * one page, filtered — not a dozen thin ones.
 *
 * Open Graph is written out in full rather than left to merge, because a
 * nested `openGraph` replaces its parent's outright. A page setting only a
 * title would quietly drop siteName and locale from the preview card.
 */
export function pageMetadata({
  locale,
  dict,
  href = routeHref,
  title,
  description,
  type = 'website',
}: Args): Metadata {
  const other = locales.find((l) => l !== locale) ?? defaultLocale;
  return {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    alternates: {
      canonical: href(locale),
      languages: {
        ...Object.fromEntries(locales.map((l) => [l, href(l)])),
        'x-default': href(defaultLocale),
      },
    },
    openGraph: {
      type,
      url: href(locale),
      siteName: dict.brand,
      locale: ogLocale(locale),
      alternateLocale: ogLocale(other),
      // The brand is already the site name; repeating it in the title would
      // print it twice on the same card.
      title: title ?? dict.meta.title,
      description: description ?? dict.meta.description,
      // The card is drawn by app/[locale]/opengraph-image.tsx. Next attaches
      // that file to its own segment only, and the `openGraph` block above
      // replaces whatever the layout resolved — so without naming the route
      // here every page below the locale root would share without a picture.
      images: [
        {
          url: `/${locale}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: dict.meta.title,
        },
      ],
    },
  };
}
