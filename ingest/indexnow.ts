import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outage } from '../lib/types';
import { fetchAreaKeyCounts } from '../lib/db';
import { findEligiblePlace } from '../lib/places';
import { locales } from '../lib/i18n/config';
import { routeHref } from '../lib/routes';
import { outageSlug, placeSlug } from '../lib/slug';
import { resolveSiteUrl } from '../lib/site';

/**
 * Tells IndexNow which pages changed, so Bing does not have to guess.
 *
 * This site publishes information with a short shelf life: an announcement
 * crawled two days late is of no use to anyone. The ingest already runs every
 * ten minutes and knows exactly which records it just wrote, so the pages that
 * changed can be named rather than waited for. One submission reaches Bing,
 * Yandex, Seznam and Naver; Google does not participate.
 *
 * Nothing here may fail a run. Not reaching a search engine is not a reason to
 * stop collecting outages, and the ingest's job is the archive — so every error
 * is caught and reported, and the caller is never given the chance to throw.
 */

// Only what actually changed, and only pages a reader could load. IndexNow asks
// that submissions be pages that were added or updated; a list padded with URLs
// that did not change, or that 404, is how a host gets its submissions ignored.
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

// The protocol allows 10,000 per request. A run that somehow produced more than
// this has bigger problems than its search ranking, and the cap keeps one bad
// batch from turning into an enormous request.
const MAX_URLS = 1000;

export type PingResult = { submitted: number; status: number | null; skipped?: string };

export async function pingIndexNow(
  client: SupabaseClient,
  written: readonly Outage[],
): Promise<PingResult> {
  const key = process.env.INDEXNOW_KEY?.trim();
  const rawSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  // Absent configuration means "not enabled", not "broken": a local run, a
  // fork, or a checkout without the secret must do nothing at all rather than
  // announce someone else's site.
  if (!key) return { submitted: 0, status: null, skipped: 'INDEXNOW_KEY is not set' };
  if (!rawSite) return { submitted: 0, status: null, skipped: 'NEXT_PUBLIC_SITE_URL is not set' };
  if (written.length === 0) return { submitted: 0, status: null, skipped: 'nothing was written' };

  const site = resolveSiteUrl(rawSite);
  // resolveSiteUrl falls back to localhost when the value is unusable, and
  // announcing localhost to a search engine is worse than announcing nothing.
  if (site.hostname === 'localhost' || site.hostname === '127.0.0.1') {
    return { submitted: 0, status: null, skipped: `refusing to submit ${site.host}` };
  }

  try {
    const urls = await changedUrls(client, written, site);
    if (urls.length === 0) return { submitted: 0, status: null, skipped: 'no addressable pages' };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: site.host,
        key,
        // The key file lives at the site root, which is where a submitter is
        // expected to put it; naming it anyway costs nothing and removes the
        // ambiguity if it ever moves.
        keyLocation: new URL(`/${key}.txt`, site).toString(),
        urlList: urls,
      }),
    });

    // 200 accepted, 202 accepted with the key still being validated. Anything
    // else is worth seeing in the log, and worth nothing more than that.
    if (response.status !== 200 && response.status !== 202) {
      console.warn(`indexnow: ${response.status} ${response.statusText} for ${urls.length} urls`);
    }
    return { submitted: urls.length, status: response.status };
  } catch (error) {
    console.warn(`indexnow: ${error instanceof Error ? error.message : String(error)}`);
    return { submitted: 0, status: null, skipped: 'request failed' };
  }
}

/**
 * Every page a batch of written records changes, in both locales.
 *
 * An outage does not only change its own page. It appears on its district's
 * page, on the page of each settlement it names that has one, and on the home
 * page — all four are genuinely different after a write, and all four are what
 * a reader searching for this outage might land on.
 */
async function changedUrls(
  client: SupabaseClient,
  written: readonly Outage[],
  site: URL,
): Promise<string[]> {
  // Which settlements have a page at all. Asked once per run, through the same
  // function the site and the sitemap use, so this cannot start submitting
  // URLs that answer 404.
  const counts = await fetchAreaKeyCounts(client);
  return changedPaths(written, counts).map((path) => new URL(path, site).toString());
}

/** The path half of the above, separated so it can be tested without a database or a network. */
export function changedPaths(
  written: readonly Outage[],
  counts: ReadonlyMap<string, number>,
): string[] {
  const paths = new Set<string>();
  for (const locale of locales) paths.add(routeHref(locale));

  for (const record of written) {
    // A record whose id is not a fingerprint has no page (lib/slug.ts).
    const slug = outageSlug(record);
    for (const locale of locales) {
      if (slug) paths.add(routeHref(locale, 'outage', slug));
      paths.add(routeHref(locale, 'district', record.district));
    }
    for (const area of record.areas) {
      const place = findEligiblePlace(placeSlug(area), counts);
      if (!place) continue;
      for (const locale of locales) paths.add(routeHref(locale, 'place', place.slug));
    }
  }

  return [...paths].slice(0, MAX_URLS);
}
