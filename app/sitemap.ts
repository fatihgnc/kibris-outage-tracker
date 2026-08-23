import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site';
import { locales } from '@/lib/i18n/config';
import { GUIDE_SLUGS } from '@/lib/content';
import { DISTRICT_IDS } from '@/lib/geography';

export const dynamic = 'force-static';

// Every page in both locales, each carrying its counterpart as an alternate so
// a search engine serves the right language rather than guessing (§7.2).
export default function sitemap(): MetadataRoute.Sitemap {
  const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const url = (path: string) => new URL(path, site).toString();

  // Paths below the locale segment, with how often each is worth re-crawling.
  const paths: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
    { path: '', changeFrequency: 'hourly', priority: 1 },
    { path: '/archive', changeFrequency: 'daily', priority: 0.6 },
    { path: '/guides', changeFrequency: 'monthly', priority: 0.7 },
    ...DISTRICT_IDS.map((id) => ({
      path: `/district/${id}`,
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    })),
    ...GUIDE_SLUGS.map((slug) => ({
      path: `/guides/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...(['about', 'privacy', 'terms'] as const).map((slug) => ({
      path: `/${slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  return paths.flatMap(({ path, changeFrequency, priority }) =>
    locales.map((locale) => ({
      url: url(`/${locale}${path}`),
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(locales.map((other) => [other, url(`/${other}${path}`)])),
      },
    })),
  );
}
