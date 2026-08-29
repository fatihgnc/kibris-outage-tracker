import { findSettlementBySlug, settlementSlugs, type MapSettlement } from './geography';

/**
 * Which settlements get a page of their own.
 *
 * There are 193 settlements on the map and two locales, so publishing one for
 * each would put 386 pages online whose only content, for most of them, is
 * "nothing has been recorded here". That is thin content in the sense search
 * engines penalise, and it is also just untrue to the reader: a page that
 * exists implies there is something to know.
 *
 * So a settlement earns its page by having a history worth reading. Below the
 * threshold the page does not exist — it is not an empty page, and it is not in
 * the sitemap. The gate lives here rather than in each caller because the page,
 * the sitemap and the links pointing at it must never disagree about which
 * places are real: a link to a 404 is worse than no link.
 */
export const PLACE_PAGE_MIN_RECORDS = 3;

export type EligiblePlace = { slug: string; settlement: MapSettlement; count: number };

/** Every settlement with enough records to publish, most-affected first. */
export function eligiblePlaces(counts: ReadonlyMap<string, number>): EligiblePlace[] {
  return settlementSlugs()
    .map(({ slug, settlement }) => ({
      slug,
      settlement,
      // The counts are keyed by the folded place name; the slug is that same
      // fold with hyphens, so one of them has to be converted to ask.
      count: counts.get(areaKeyOf(slug)) ?? 0,
    }))
    .filter((place) => place.count >= PLACE_PAGE_MIN_RECORDS)
    .sort((a, b) => b.count - a.count || a.settlement.name.localeCompare(b.settlement.name, 'tr'));
}

/** The settlement one slug names, but only if it has enough history to be published. */
export function findEligiblePlace(
  slug: string,
  counts: ReadonlyMap<string, number>,
): EligiblePlace | null {
  const settlement = findSettlementBySlug(slug);
  if (!settlement) return null;
  const count = counts.get(areaKeyOf(slug)) ?? 0;
  return count >= PLACE_PAGE_MIN_RECORDS ? { slug, settlement, count } : null;
}

/**
 * The `area_keys` value a slug corresponds to.
 *
 * foldKey collapses every run of non-alphanumerics to a single space and
 * `placeSlug` turns those spaces into hyphens, so a folded name never contains
 * a hyphen of its own and this reverses cleanly.
 */
export function areaKeyOf(slug: string): string {
  return slug.replace(/-/g, ' ');
}
