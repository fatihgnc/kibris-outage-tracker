import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site';
import { locales, type Locale } from '@/lib/i18n/config';
import { GUIDE_SLUGS, guideHref, routeHref } from '@/lib/routes';
import { DISTRICT_IDS } from '@/lib/geography';

export const dynamic = 'force-static';

// Every page in both locales, each carrying its counterpart as an alternate so
// a search engine serves the right language rather than guessing (§7.2).
//
// A page is listed by the route it is, not by a path string, because the path
// is translated: the same entry is /tr/arsiv here and /en/archive there.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const url = (path: string) => new URL(path, site).toString();

  type Entry = {
    href: (locale: Locale) => string;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
  };

  const entries: Entry[] = [
    { href: (l) => routeHref(l), changeFrequency: 'hourly', priority: 1 },
    { href: (l) => routeHref(l, 'archive'), changeFrequency: 'daily', priority: 0.6 },
    { href: (l) => routeHref(l, 'guides'), changeFrequency: 'monthly', priority: 0.7 },
    ...DISTRICT_IDS.map((id) => ({
      href: (l: Locale) => routeHref(l, 'district', id),
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    })),
    ...GUIDE_SLUGS.map((slug) => ({
      href: (l: Locale) => guideHref(l, slug),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...(['about', 'privacy', 'terms'] as const).map((slug) => ({
      href: (l: Locale) => routeHref(l, slug),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  return entries.flatMap(({ href, changeFrequency, priority }) =>
    locales.map((locale) => ({
      url: url(href(locale)),
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(locales.map((other) => [other, url(href(other))])),
      },
    })),
  );
}
