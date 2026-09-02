import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';

/**
 * Drops every cached page, so the next reader gets a fresh render.
 *
 * The pages are ISR with a one-minute window, and a minute is fine while
 * someone is reading. What that window does not cover is a page nobody has
 * opened for hours: time-based revalidation is stale-while-revalidate, so the
 * first visitor after a quiet night is served the page as it was at the last
 * visit — a district page said "no outage" seven hours after the fact — and
 * only the second visitor sees the truth. On-demand invalidation is different:
 * the next request renders (Next docs, "How revalidation works"). The ingest
 * calls this after every successful run (ingest/revalidate.ts).
 *
 * This is not the ingest inside a route handler (SPEC §8): it holds no data,
 * reads nothing, and writes nothing but a cache mark. The secret keeps a
 * stranger from making every reader pay for a render on demand.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  // Unset is a configuration gap, not an unauthorised caller; say which.
  if (!secret) return new Response('REVALIDATE_SECRET is not set', { status: 503 });

  const given = request.headers.get('x-revalidate-secret') ?? '';
  if (!sameSecret(given, secret)) return new Response('unauthorised', { status: 401 });

  // Everything under the locale layout — both locales, the home page, every
  // district, settlement and outage page — in one mark. The layout is where
  // the status bar reads the update stamp, so it is stale on every page at
  // once whenever the ingest has run.
  revalidatePath('/[locale]', 'layout');
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
