'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n/config';
import { localizedPath, parsePath } from '@/lib/routes';

type Props = {
  locale: Locale;
  labels: { ariaLabel: string; turkish: string; english: string };
};

// Real anchors to the same page in the other locale: works without JavaScript
// and can be opened in a new tab. The path is translated, not just re-prefixed
// — /tr/rehberler/kesinti-turleri leads to /en/guides/outage-types — and every
// query parameter is preserved. The click also writes the locale cookie so the
// explicit choice wins over Accept-Language on later visits (§7.2).
export default function LocaleSwitcher({ locale, labels }: Props) {
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString();
  // A path this map does not know (a 404) still switches language, at the root:
  // there is no counterpart page to send the reader to.
  const here = parsePath(pathname);
  const hrefFor = (target: Locale) =>
    `${here ? localizedPath(here, target) : `/${target}`}${search ? `?${search}` : ''}`;
  const remember = (target: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;
  };
  const linkClass = (target: Locale) =>
    target === locale ? 'tap-target text-lamp no-underline' : 'tap-target text-muted no-underline hover:text-text';

  return (
    <nav aria-label={labels.ariaLabel} className="flex items-center font-mono text-meta">
      <a
        href={hrefFor('tr')}
        lang="tr"
        aria-label={labels.turkish}
        aria-current={locale === 'tr' ? 'true' : undefined}
        onClick={() => remember('tr')}
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
        onClick={() => remember('en')}
        className={linkClass('en')}
      >
        EN
      </a>
    </nav>
  );
}
