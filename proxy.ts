import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './lib/i18n/config';

// Locale resolution (§7.2): cookie, then Accept-Language, then Turkish.
// The cookie is written by the language switcher, so an explicit choice wins
// over the device language on every later visit.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split('/')[1];
  if (isLocale(firstSegment)) return NextResponse.next();

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  let locale = cookie && isLocale(cookie) ? cookie : null;

  if (!locale) {
    const header = request.headers.get('accept-language') ?? '';
    for (const part of header.split(',')) {
      const base = part.split(';')[0].trim().toLowerCase().split('-')[0];
      if (isLocale(base)) {
        locale = base;
        break;
      }
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale ?? defaultLocale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
