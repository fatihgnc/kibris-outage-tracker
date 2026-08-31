'use client';

import type { MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n/config';
import { localizedPath, parsePath } from '@/lib/routes';

type Props = {
  locale: Locale;
  labels: { ariaLabel: string; turkish: string; english: string };
};

// Real anchors to the same page in the other locale: works without JavaScript
// and can be opened in a new tab. The path is translated, not just re-prefixed
// — /tr/rehberler/kesinti-turleri leads to /en/guides/outage-types. The click
// also writes the locale cookie so the explicit choice wins over
// Accept-Language on later visits (§7.2).
//
// The query string joins the href at click time, not at render time: reading
// it through useSearchParams pulled the whole component out of the cached
// page's HTML, and "TR | EN" popping in after hydration re-wrapped the status
// line and shoved the entire page down — the one real layout shift the site
// had. A switcher that is in the HTML from the first byte cannot move
// anything.
// Outside the component so nothing here is render-time work: the cookie
// records the explicit choice, and the live query (e.g. a district filter)
// joins the href on the anchor before the browser reads it to navigate.
// Without JavaScript the link still lands on the right page, just without
// the filter.
function switchLocale(event: MouseEvent<HTMLAnchorElement>, target: Locale, href: string) {
  document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;
  const { search } = window.location;
  if (search) event.currentTarget.href = `${href}${search}`;
}

export default function LocaleSwitcher({ locale, labels }: Props) {
  const pathname = usePathname() ?? '/';
  // A path this map does not know (a 404) still switches language, at the root:
  // there is no counterpart page to send the reader to.
  const here = parsePath(pathname);
  const hrefFor = (target: Locale) => (here ? localizedPath(here, target) : `/${target}`);
  const linkClass = (target: Locale) =>
    target === locale ? 'tap-target text-lamp no-underline' : 'tap-target text-muted no-underline hover:text-text';

  return (
    <nav aria-label={labels.ariaLabel} className="flex items-center font-mono text-meta">
      <a
        href={hrefFor('tr')}
        lang="tr"
        aria-label={labels.turkish}
        aria-current={locale === 'tr' ? 'true' : undefined}
        onClick={(event) => switchLocale(event, 'tr', hrefFor('tr'))}
        className={linkClass('tr')}
      >
        TR
      </a>
      <span aria-hidden className="mx-2 h-3.5 w-px bg-dark" />
      <a
        href={hrefFor('en')}
        lang="en"
        aria-label={labels.english}
        aria-current={locale === 'en' ? 'true' : undefined}
        onClick={(event) => switchLocale(event, 'en', hrefFor('en'))}
        className={linkClass('en')}
      >
        EN
      </a>
    </nav>
  );
}
