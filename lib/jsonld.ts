import type { Locale } from './i18n/config';
import type { Dictionary } from './i18n/dictionaries';
import type { Outage } from './types';
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

type AnnouncementArgs = {
  locale: Locale;
  dict: Dictionary;
  outage: Outage;
  /** The district's display name — the announcement's area, in words. */
  districtName: string;
  /** This outage's page, locale segment included. */
  path: string;
  name: string;
  text: string;
};

/**
 * One outage, as the schema type Google defines for exactly this: a public
 * announcement about a utility interruption.
 *
 * `expires` is what tells a search engine to stop surfacing the notice, so it
 * matters that it is honest. A fault with no announced end has no expiry we
 * know — the field is omitted rather than filled with the display bound from
 * `NO_END_ASSUMED_OVER_MS`, which is an assumption this site makes for layout
 * and not a time anybody published.
 *
 * `category` is deliberately absent. The vocabulary wants a URL naming the kind
 * of announcement, and a wrong one is worse than none: it would tell a search
 * engine this notice is about something it is not.
 */
export function specialAnnouncementJsonLd({
  locale,
  dict,
  outage,
  districtName,
  path,
  name,
  text,
}: AnnouncementArgs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SpecialAnnouncement',
    name,
    text,
    inLanguage: locale,
    url: absoluteUrl(path),
    mainEntityOfPage: absoluteUrl(path),
    datePosted: outage.publishedAt,
    ...(outage.endsAt && { expires: outage.endsAt }),
    spatialCoverage: {
      '@type': 'AdministrativeArea',
      name: districtName,
    },
    publisher: {
      '@type': 'Organization',
      '@id': absoluteUrl(PUBLISHER),
      name: dict.brand,
      url: absoluteUrl('/'),
    },
  };
}

/**
 * The questions a page actually prints.
 *
 * Callers pass the same array they render. Google drops an FAQPage whose
 * answers are not visible on the page, and — worse for a site whose whole
 * claim is that its data is checked — structured data that says something the
 * page does not is the kind of mismatch a manual action is for.
 */
export function faqJsonLd(entries: readonly { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

/** An ordered list of pages — the archive, and the outage lists that link into it. */
export function itemListJsonLd(name: string, items: readonly { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
