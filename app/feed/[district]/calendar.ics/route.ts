import { notFound } from 'next/navigation';
import { DISTRICT_IDS, isDistrictId } from '@/lib/districts';
import { getDistrictOutages, getNow } from '@/lib/data';
import { buildIcs } from '@/lib/feeds';
import { resolveSiteUrl } from '@/lib/site';

// A district's announced work as a calendar subscription (lib/feeds.ts).
// Regenerated on its own clock rather than the ingest's: a calendar client
// polls hourly at best, and five minutes of staleness is well inside that.
export const revalidate = 300;

export function generateStaticParams() {
  return DISTRICT_IDS.map((district) => ({ district }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ district: string }> }) {
  const { district } = await params;
  if (!isDistrictId(district)) notFound();
  const now = await getNow();
  // Recent first, and enough of them that a month of work is on the calendar.
  const records = await getDistrictOutages(now, district, 60);
  const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  return new Response(buildIcs(district, records, site), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${district}.ics"`,
    },
  });
}
