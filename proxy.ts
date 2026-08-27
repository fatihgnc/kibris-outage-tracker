import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './lib/i18n/config';
import { internalPath, localizedPath, parsePath } from './lib/routes';

// Locale resolution (§7.2): cookie, then Accept-Language, then Turkish.
// The cookie is written by the language switcher, so an explicit choice wins
// over the device language on every later visit.
//
// Then the address is settled. A Turkish reader's URLs are Turkish words
// (/tr/arsiv), while the folders under app/[locale] keep their English names,
// so every request below a locale is:
//
//   1. redirected, if it is spelled in the wrong locale's words — /tr/archive
//      and /en/arsiv each have one right address, and a page indexed under two
//      URLs competes with itself;
//   2. rewritten onto the folder that renders it, which the reader never sees.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split('/')[1];

  if (!isLocale(firstSegment)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${detectLocale(request)}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  const parsed = parsePath(pathname);
  if (!parsed) return NextResponse.next();

  const canonical = localizedPath(parsed, parsed.locale);
  if (canonical !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    // Permanent: these are the addresses search engines and other sites hold.
    return NextResponse.redirect(url, 308);
  }

  const internal = internalPath(parsed);
  if (internal === pathname) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = internal;
  return NextResponse.rewrite(url);
}

function detectLocale(request: NextRequest) {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookie && isLocale(cookie)) return cookie;

  const header = request.headers.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const base = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
