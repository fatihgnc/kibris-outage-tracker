import type { Locale } from './i18n/config';
import type { Dictionary } from './i18n/dictionaries';
import { resolveSiteUrl } from './site';

// Structured data has to be absolute — a search engine reads these documents
// detached from the page they arrived on, so a relative path means nothing.
export function absoluteUrl(path: string): string {
  return new URL(path, resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)).toString();
}

// Stable node ids, so the site graph on the home page and the breadcrumbs on
// every other page describe one publisher rather than six.
const PUBLISHER = '#publisher';

/**
 * The site and who publishes it. Emitted once, on the home page: repeating it
 * under every route says nothing new and only invites disagreement between
 * copies.
 */
export function siteJsonLd(locale: Locale, dict: Dictionary) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl(PUBLISHER),
        name: dict.brand,
        url: absoluteUrl('/'),
        logo: absoluteUrl('/icon-512.png'),
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl(`/${locale}#website`),
        url: absoluteUrl(`/${locale}`),
        name: dict.brand,
        description: dict.meta.description,
        inLanguage: locale,
        publisher: { '@id': absoluteUrl(PUBLISHER) },
      },
    ],
  };
}

export type Crumb = { name: string; path: string };

/** The trail back to the home page, in the order a reader would walk it. */
export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

type ArticleArgs = {
  locale: Locale;
  dict: Dictionary;
  path: string;
  title: string;
  description: string;
  /** ISO date from the document's frontmatter; may be absent. */
  updated?: string;
};

/**
 * A guide. `dateModified` is the "last reviewed" date the page already shows,
 * so the structured data cannot claim a freshness the page itself does not.
 *
 * The publisher is written out rather than referenced by id: the site graph is
 * only emitted on the home page, and a dangling `@id` describes nobody.
 */
export function articleJsonLd({ locale, dict, path, title, description, updated }: ArticleArgs) {
  const publisher = {
    '@type': 'Organization',
    '@id': absoluteUrl(PUBLISHER),
    name: dict.brand,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon-512.png'),
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    inLanguage: locale,
    mainEntityOfPage: absoluteUrl(path),
    ...(updated && { datePublished: updated, dateModified: updated }),
    author: publisher,
    publisher,
  };
}
