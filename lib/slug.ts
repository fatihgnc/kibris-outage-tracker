import type { Outage } from './types';
import { nicosiaWallClock } from './time';
import { foldKey } from '../ingest/parse/text';

/**
 * How a stored record becomes an address.
 *
 * An outage's URL is two halves doing different jobs:
 *
 *   /tr/kesinti/2026-08-26-guzelyurt-yuvacik-a3f19c2b
 *               └──────── readable ────────┘ └─ id ─┘
 *
 * Only the right half identifies anything. The left half is for the person
 * reading the link, and it is *not* stable: §10.6 merges pull `startsAt`
 * earlier and widen `areas`, so a record's readable half can change after it
 * has been shared. The page resolves on the id prefix alone and redirects to
 * whatever the readable half is now, so the old link keeps working.
 *
 * The id prefix is not shown anywhere on the page. SPEC §12 forbids fabricated
 * reference numbers, and a hex string presented to a reader as if it were a
 * KIB-TEK case number is exactly that; in the address bar it is a URL, which
 * is what every site's article slugs already look like.
 */

// Long enough that no two of the stored ids share one. Eight hex characters is
// 4.3 billion values against a table that grows by a few hundred rows a year,
// and `fetchOutageByIdPrefix` refuses to guess if two ever do collide rather
// than serving an arbitrary one of them.
const ID_PREFIX_LENGTH = 8;

const TRAILING_ID = new RegExp(`-([0-9a-f]{${ID_PREFIX_LENGTH}})$`);
const HEX_PREFIX = new RegExp(`^[0-9a-f]{${ID_PREFIX_LENGTH}}$`);

/** A place name as a URL segment: 'Küçük Kaymaklı' → 'kucuk-kaymakli'. */
export function placeSlug(name: string): string {
  return foldKey(name).replace(/ /g, '-');
}

/**
 * The address of one outage, or null if it does not have one.
 *
 * Null happens when the id is not a fingerprint. Every id the ingest writes is
 * one — `fingerprint()` is a sha256 sliced to 32 hex characters — but a row put
 * in by hand is not, and the development database had four of them ('res-recent-…',
 * 'aaa1-…') sitting among the live records. Their first eight characters are not
 * hex, so `outageIdPrefix` cannot read them back out of a slug and the page
 * would 404 on a link the site itself printed.
 *
 * So the round trip is checked here rather than assumed, and a record that
 * cannot survive it is simply not addressed: the card renders without a link
 * instead of offering a dead one. Callers must handle null — that is the point
 * of returning it rather than a broken string.
 */
export function outageSlug(outage: Pick<Outage, 'id' | 'startsAt' | 'district' | 'areas'>): string | null {
  const prefix = outage.id.slice(0, ID_PREFIX_LENGTH);
  if (!HEX_PREFIX.test(prefix)) return null;

  const wall = nicosiaWallClock(Date.parse(outage.startsAt));
  const date = `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
  // The day is the island's, not UTC's: an outage announced for the evening of
  // the 26th must not be filed under the 27th because Nicosia is ahead of UTC.
  const place = outage.areas.length > 0 ? placeSlug(outage.areas[0]) : '';
  return [date, outage.district, place, prefix].filter(Boolean).join('-');
}

/**
 * The id prefix a slug points at, or null if it does not carry one.
 *
 * Deliberately ignores everything to the left of it. A visitor arriving on a
 * stale readable half — or on a hand-typed one — still reaches the right
 * record, and the page then sends them to the current address.
 */
export function outageIdPrefix(slug: string): string | null {
  return TRAILING_ID.exec(slug)?.[1] ?? null;
}

/**
 * The records that have a page, paired with its address.
 *
 * Every list that links to outage pages — the two ItemList blocks, the sitemap —
 * has to drop the ones `outageSlug` refuses, and doing that inline at each call
 * site is four chances to forget. Publishing a URL for a record the router
 * cannot resolve is worse than omitting it: a sitemap full of 404s is a quality
 * signal in the wrong direction.
 */
export function addressable<T extends Pick<Outage, 'id' | 'startsAt' | 'district' | 'areas'>>(
  records: readonly T[],
): { record: T; slug: string }[] {
  const out: { record: T; slug: string }[] = [];
  for (const record of records) {
    const slug = outageSlug(record);
    if (slug) out.push({ record, slug });
  }
  return out;
}
