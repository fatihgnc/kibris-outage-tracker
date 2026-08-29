import { locales, type Locale } from './i18n/config';

/**
 * A Turkish reader gets a Turkish address: /tr/arsiv, not /tr/archive.
 *
 * The folder names under app/[locale] stay English — they are keys, not
 * addresses. proxy.ts rewrites the address a reader sees onto the folder that
 * renders it, and redirects anything that is not the canonical spelling for
 * its locale, so each page answers on exactly one URL.
 *
 * Nothing here touches the filesystem or `next/*`, because proxy.ts, the
 * server pages and two client components all read the same map.
 */

export const ROUTE_KEYS = [
  'archive',
  'guides',
  'district',
  'outage',
  'place',
  'about',
  'privacy',
  'terms',
] as const;

export type RouteKey = (typeof ROUTE_KEYS)[number];

// ASCII only. A percent-encoded 'ş' survives a round trip but not a copy-paste
// into a message, and these get pasted.
const SEGMENTS: Record<RouteKey, Record<Locale, string>> = {
  archive: { tr: 'arsiv', en: 'archive' },
  guides: { tr: 'rehberler', en: 'guides' },
  district: { tr: 'bolge', en: 'district' },
  outage: { tr: 'kesinti', en: 'outage' },
  place: { tr: 'yer', en: 'place' },
  about: { tr: 'hakkinda', en: 'about' },
  privacy: { tr: 'gizlilik', en: 'privacy' },
  terms: { tr: 'kullanim-kosullari', en: 'terms' },
};

// The keys are the content filenames (content/guides/<key>.<locale>.md); the
// values are what the reader sees. Turkish slugs carry the words someone would
// actually search for, which is the whole point of translating them.
export const GUIDE_SLUGS = [
  'report-a-fault',
  'outage-types',
  'long-outage',
  'surge-protection',
  'billing-and-tariffs',
  'how-we-collect-data',
] as const;

export type GuideSlug = (typeof GUIDE_SLUGS)[number];

const GUIDE_SEGMENTS: Record<GuideSlug, Record<Locale, string>> = {
  'report-a-fault': { tr: 'elektrik-arizasi-bildirimi', en: 'report-a-fault' },
  'outage-types': { tr: 'kesinti-turleri', en: 'outage-types' },
  'long-outage': { tr: 'uzun-kesintide-ne-yapmali', en: 'long-outage' },
  'surge-protection': { tr: 'dalgalanma-korumasi', en: 'surge-protection' },
  'billing-and-tariffs': { tr: 'fatura-ve-tarifeler', en: 'billing-and-tariffs' },
  'how-we-collect-data': { tr: 'verileri-nasil-topluyoruz', en: 'how-we-collect-data' },
};

export function isGuideSlug(value: string): value is GuideSlug {
  return (GUIDE_SLUGS as readonly string[]).includes(value);
}

/** The address a reader in `locale` sees. `sub` is a district id, already locale-neutral. */
export function routeHref(locale: Locale, key?: RouteKey, sub?: string): string {
  if (!key) return `/${locale}`;
  const tail = sub ? `/${sub}` : '';
  return `/${locale}/${SEGMENTS[key][locale]}${tail}`;
}

/** A guide's address, from the content key: ('tr', 'report-a-fault') → /tr/rehberler/elektrik-arizasi-bildirimi */
export function guideHref(locale: Locale, slug: GuideSlug): string {
  return `/${locale}/${SEGMENTS.guides[locale]}/${GUIDE_SEGMENTS[slug][locale]}`;
}

export type ParsedPath = {
  locale: Locale;
  key: RouteKey | null;
  /** A district id, or a guide's content key. Absent on section roots. */
  sub: string | null;
};

// Reverse lookups accept any locale's spelling, not just the current one. That
// is what lets /tr/archive be recognised well enough to be redirected, and what
// lets the language switcher read a Turkish path while rendering an English one.
function keyOf(segment: string): RouteKey | null {
  return ROUTE_KEYS.find((key) => locales.some((l) => SEGMENTS[key][l] === segment)) ?? null;
}

function guideKeyOf(segment: string): GuideSlug | null {
  return GUIDE_SLUGS.find((slug) => locales.some((l) => GUIDE_SEGMENTS[slug][l] === segment)) ?? null;
}

/**
 * Reads a path into the route it names, in whichever locale's words it was
 * spelled. Returns null for anything outside this map — an unknown section,
 * or a path with no locale — which the caller should leave alone.
 */
export function parsePath(pathname: string): ParsedPath | null {
  const [, first, second, third, ...extra] = pathname.split('/');
  if (!isLocaleSegment(first)) return null;
  if (!second) return { locale: first, key: null, sub: null };

  const key = keyOf(second);
  if (!key || extra.length > 0) return null;
  if (!third) return { locale: first, key, sub: null };

  if (key === 'guides') {
    const slug = guideKeyOf(third);
    return slug ? { locale: first, key, sub: slug } : null;
  }
  // A slug under /gizlilik is not a page, so only the sections that actually
  // take one are let through. Their children are locale-neutral — a district
  // id, a settlement's folded name, an outage's address — so unlike a guide
  // slug they are carried across a locale switch unchanged.
  if (!CHILD_KEYS.has(key)) return null;
  return { locale: first, key, sub: third };
}

const CHILD_KEYS = new Set<RouteKey>(['district', 'outage', 'place']);

function isLocaleSegment(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

/** The same page, addressed in `target`'s words. */
export function localizedPath(parsed: ParsedPath, target: Locale): string {
  const { key, sub } = parsed;
  if (!key) return `/${target}`;
  if (key === 'guides' && sub) return guideHref(target, sub as GuideSlug);
  return routeHref(target, key, sub ?? undefined);
}

/** The app/[locale] path that renders this page — always the English folder names. */
export function internalPath(parsed: ParsedPath): string {
  const { locale, key, sub } = parsed;
  if (!key) return `/${locale}`;
  return `/${locale}/${key}${sub ? `/${sub}` : ''}`;
}
