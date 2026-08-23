import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site';

export const dynamic = 'force-static';

// We ask the outlets' crawlers to respect robots.txt, so publishing our own is
// the least we can do. Everything here is public and meant to be indexed.
export default function robots(): MetadataRoute.Robots {
  const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', site).toString(),
    host: site.host,
  };
}
