const FALLBACK = 'http://localhost:3000';

// NEXT_PUBLIC_SITE_URL is typed by hand into a dashboard, so it arrives in
// whatever shape someone happened to paste: a bare hostname, a trailing slash,
// stray whitespace. new URL() throws on a bare hostname, and a throw here takes
// down generateMetadata for every page — so normalise rather than trust.
export function resolveSiteUrl(raw: string | undefined): URL {
  const value = raw?.trim();
  if (!value) return new URL(FALLBACK);

  // A bare hostname ("example.com") is the common paste. Assume https, which is
  // what any host serving this site in production speaks.
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(withProtocol);
  } catch {
    // Still unusable: fall back rather than break the whole page. Metadata
    // links come out relative to localhost, which is wrong but visible.
    console.warn(`NEXT_PUBLIC_SITE_URL is not a usable URL: ${JSON.stringify(raw)}`);
    return new URL(FALLBACK);
  }
}
