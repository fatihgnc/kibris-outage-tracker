import { notFound } from 'next/navigation';
import { DISTRICT_IDS, isDistrictId } from '@/lib/districts';
import { getDistrictOutages, getNow } from '@/lib/data';
import { buildRss } from '@/lib/feeds';
import { resolveSiteUrl } from '@/lib/site';

// A district's outages as an RSS feed, newest first (lib/feeds.ts).
export const revalidate = 300;

export function generateStaticParams() {
  return DISTRICT_IDS.map((district) => ({ district }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ district: string }> }) {
  const { district } = await params;
  if (!isDistrictId(district)) notFound();
  const now = await getNow();
  const records = await getDistrictOutages(now, district, 30);
  const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  return new Response(buildRss(district, records, site), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
