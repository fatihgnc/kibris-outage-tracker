import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Public_Sans } from 'next/font/google';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import { notFound } from 'next/navigation';
import '../globals.css';
import { isLocale, locales, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getFreshness, getNow, getOutages } from '@/lib/data';
import { resolveSiteUrl } from '@/lib/site';
import { formatYear } from '@/lib/time';
import StatusBar from '@/components/StatusBar';
import NavLinks from '@/components/NavLinks';
import ConsentBanner from '@/components/ConsentBanner';
import { adsConfigured } from '@/lib/consent';
import { routeHref } from '@/lib/routes';

// Latin Extended so Turkish characters (ı, İ, ş, ğ, ü, ö, ç) render correctly.
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});
const publicSans = Public_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-public-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

// Every view depends on the current time, but a "now" up to a minute old
// changes nothing a reader can see: statuses move on announced clock times,
// the countdown corrects itself after hydration, and the ingest that feeds
// the data runs on a ten-minute cron. A minute of shared cache is the
// difference between every reader paying a full render and almost none.
export const revalidate = 60;

export const viewport: Viewport = {
  themeColor: '#0b1220',
};

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return {
    metadataBase: resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
    // No brand suffix: the domain is the brand, and a search result already
    // prints it on the line above the title.
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: {
      languages: { tr: '/tr', en: '/en', 'x-default': '/tr' },
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      siteName: dict.brand,
      locale: locale === 'tr' ? 'tr_TR' : 'en_US',
      alternateLocale: locale === 'tr' ? 'en_US' : 'tr_TR',
      type: 'website',
    },
    // The card is 1200x630, so it is worth the wide treatment. Its image and
    // text come from the Open Graph block above; only the shape is set here.
    twitter: { card: 'summary_large_image' },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dict = await getDictionary(locale);
  const now = await getNow();
  const [outages, freshness] = await Promise.all([getOutages(now), getFreshness(now)]);

  return (
    <html lang={locale} className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <StatusBar locale={locale} dict={dict} outages={outages} now={now} freshness={freshness} />

        {/* Wraps rather than squeezes: with a long brand there is not enough
          * room at 360px for both, and without this the nav keeps its width by
          * breaking a label across two lines. */}
        <header className="mx-auto flex w-full max-w-[1060px] flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-5 pt-4">
          <Link
            href={`/${locale}`}
            className="opsz-40 font-display text-body font-semibold tracking-[-0.01em] text-text no-underline"
          >
            {dict.brand}
          </Link>
          <NavLinks
            locale={locale}
            homeLabel={dict.nav.home}
            archiveLabel={dict.nav.archive}
            guidesLabel={dict.nav.guides}
          />
        </header>

        <main className="mx-auto w-full max-w-[1060px] flex-1 px-5 pb-2">{children}</main>

        <footer className="mt-12 border-t border-dark">
          <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-6 px-5 pb-9 pt-4">
            {/* The persistent disclaimer (§1.4): every duration is an estimate. */}
            <p className="m-0 text-meta text-muted">{dict.footer.disclaimer}</p>
            {/* Three parts: the domain, the legal links, the imprint. The
              * update stamp is not repeated here — the status bar carries it,
              * at the top, where the reader is already looking for it. The
              * side columns share a width so the links sit on the page's
              * centre line rather than on the midpoint of what is left over.
              * The middot between the links is decorative, so a screen reader
              * announces them back to back. */}
            <div className="flex flex-col gap-2 font-mono text-meta text-muted sm:flex-row sm:items-center sm:gap-4">
              <p className="m-0 sm:flex-1">{dict.brand}</p>
              <nav
                aria-label={dict.footer.legalAriaLabel}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-center"
              >
                <Link href={routeHref(locale, 'about')} className="text-muted no-underline hover:text-text">
                  {dict.legal.about}
                </Link>
                <span aria-hidden="true">·</span>
                <Link href={routeHref(locale, 'privacy')} className="text-muted no-underline hover:text-text">
                  {dict.legal.privacy}
                </Link>
                <span aria-hidden="true">·</span>
                <Link href={routeHref(locale, 'terms')} className="text-muted no-underline hover:text-text">
                  {dict.legal.terms}
                </Link>
              </nav>
              <p className="m-0 sm:flex-1 sm:text-right">
                {fill(dict.footer.copyright, { year: formatYear(now, locale) })}
              </p>
            </div>
          </div>
        </footer>

        {/* Asked once, and only when there is something to ask about: with no
          * ad network configured nothing sets an advertising cookie, so the
          * banner would be consent theatre. Whether the question is still
          * open is the banner's own to decide — it reads the cookie in the
          * browser, because this page is cached and shared and the HTML
          * cannot carry one reader's answer. A refusal is never re-prompted
          * (§11.6). */}
        {adsConfigured() && <ConsentBanner locale={locale} strings={dict.consent} />}

        {/* Cookieless page counts: no identifier is stored on the device, so it
          * sits outside the consent question above (§11.6), which guards the
          * advertising cookies only. */}
        <Analytics />
      </body>
    </html>
  );
}
