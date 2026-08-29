import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site';
import { locales, type Locale } from '@/lib/i18n/config';
import { GUIDE_SLUGS, guideHref, routeHref } from '@/lib/routes';
import { DISTRICT_IDS } from '@/lib/geography';
import { getAreaKeyCounts, getFreshness, getNow, getOutageRefs } from '@/lib/data';
import { eligiblePlaces } from '@/lib/places';
import { addressable } from '@/lib/slug';

// Recomputed hourly rather than frozen at build time. Two of the sections below
// are decided by the data — which outages have pages, and which settlements
// have crossed the threshold in lib/places.ts — so a build-time snapshot starts
// going stale the next time the ingest runs, and stays stale until a deploy.
export const revalidate = 3600;

// How far back an outage keeps a listing. Its page does not disappear after
// this; it just stops being something we ask a crawler to revisit.
const OUTAGE_HORIZON_MONTHS = 12;

// Every page in both locales, each carrying its counterpart as an alternate so
// a search engine serves the right language rather than guessing (§7.2).
//
// A page is listed by the route it is, not by a path string, because the path
// is translated: the same entry is /tr/arsiv here and /en/archive there.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const url = (path: string) => new URL(path, site).toString();

  const now = await getNow();
  const since = new Date(now - OUTAGE_HORIZON_MONTHS * 30 * 86400000).toISOString();
  const [freshness, outages, areaCounts] = await Promise.all([
    orFallback('freshness', getFreshness(now), { lastCheckedAt: null, stale: true }),
    orFallback('outages', getOutageRefs(now, since), []),
    orFallback('areaCounts', getAreaKeyCounts(now), new Map<string, number>()),
  ]);

  // The data pages are only as new as the last successful ingest run, so that
  // is what they claim — not the moment this file happened to be regenerated.
  // A lastmod of "now" on every fetch teaches a crawler that the date means
  // nothing, which costs the pages where it does mean something.
  const dataChangedAt = freshness.lastCheckedAt ? new Date(freshness.lastCheckedAt) : undefined;

  type Entry = {
    href: (locale: Locale) => string;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
    lastModified?: Date;
  };

  const entries: Entry[] = [
    { href: (l) => routeHref(l), changeFrequency: 'hourly', priority: 1, lastModified: dataChangedAt },
    {
      href: (l) => routeHref(l, 'archive'),
      changeFrequency: 'daily',
      priority: 0.6,
      lastModified: dataChangedAt,
    },
    { href: (l) => routeHref(l, 'guides'), changeFrequency: 'monthly', priority: 0.7 },
    ...DISTRICT_IDS.map((id) => ({
      href: (l: Locale) => routeHref(l, 'district', id),
      changeFrequency: 'hourly' as const,
      priority: 0.9,
      lastModified: dataChangedAt,
    })),
    // Only the settlements with enough history to have a page. Listing the rest
    // would ask a crawler to fetch 380 pages that answer 404.
    ...eligiblePlaces(areaCounts).map((place) => ({
      href: (l: Locale) => routeHref(l, 'place', place.slug),
      changeFrequency: 'daily' as const,
      priority: 0.7,
      lastModified: dataChangedAt,
    })),
    // A record's own last write, which is a real date: a merge or a repair
    // report changes the page, and nothing else does.
    ...addressable(outages).map(({ record, slug }) => ({
      href: (l: Locale) => routeHref(l, 'outage', slug),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
      lastModified: new Date(record.updatedAt),
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

  return entries.flatMap(({ href, changeFrequency, priority, lastModified }) =>
    locales.map((locale) => ({
      url: url(href(locale)),
      changeFrequency,
      priority,
      ...(lastModified && { lastModified }),
      alternates: {
        languages: Object.fromEntries(locales.map((other) => [other, url(href(other))])),
      },
    })),
  );
}

/**
 * A sitemap must never be the reason a deploy fails.
 *
 * `revalidate` makes Next prerender this route at build time, and the sections
 * below that come from the database need a reachable database to do it. The
 * first build after this file started querying died on exactly that: no
 * Supabase at build time, so `getFreshness` threw and the whole export exited.
 * On Vercel the same thing would take out a deploy for a database blip.
 *
 * The static half of the sitemap — home, archive, guides, districts, the legal
 * pages — depends on nothing and must always ship. So a failed read degrades to
 * an empty section rather than an exception: the sitemap goes out without its
 * outage and settlement entries, and the next revalidation an hour later picks
 * them up. Missing entries for an hour is a smaller problem than no sitemap,
 * and much smaller than no deploy.
 */
async function orFallback<T>(what: string, work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.warn(`sitemap: ${what} unavailable, omitting those entries — ${String(error)}`);
    return fallback;
  }
}
