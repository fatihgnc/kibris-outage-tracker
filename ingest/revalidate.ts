import { resolveSiteUrl } from '../lib/site';

/**
 * Tells the site a run has finished, so its cached pages are dropped.
 *
 * Why this exists is written on the receiving end (app/api/revalidate). The
 * shape here mirrors ingest/indexnow.ts: absent configuration means "not
 * enabled", nothing here may fail a run, and the result is for the log.
 */

export type RevalidateResult = { ok: boolean; status: number | null; skipped?: string };

// A revalidation that takes longer than this is not going to happen; the run
// has already done its job and must not sit waiting on a cold function.
const TIMEOUT_MS = 15_000;

export async function pingRevalidate(fetchImpl: typeof fetch = fetch): Promise<RevalidateResult> {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  const rawSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!secret) return { ok: false, status: null, skipped: 'REVALIDATE_SECRET is not set' };
  if (!rawSite) return { ok: false, status: null, skipped: 'NEXT_PUBLIC_SITE_URL is not set' };

  const site = resolveSiteUrl(rawSite);
  // resolveSiteUrl falls back to localhost when the value is unusable; there is
  // no site there to refresh.
  if (site.hostname === 'localhost' || site.hostname === '127.0.0.1') {
    return { ok: false, status: null, skipped: `refusing to call ${site.host}` };
  }

  try {
    const response = await fetchImpl(new URL('/api/revalidate', site), {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) {
      console.warn(`revalidate: ${response.status} ${response.statusText}`);
    }
    return { ok: response.status === 200, status: response.status };
  } catch (error) {
    console.warn(`revalidate: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: null, skipped: 'request failed' };
  }
}
