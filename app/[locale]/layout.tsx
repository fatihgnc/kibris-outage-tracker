import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Public_Sans } from 'next/font/google';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '../globals.css';
import { isLocale, locales, type Locale } from '@/lib/i18n/config';
import { fill, getDictionary } from '@/lib/i18n/dictionaries';
import { getFreshness, getNow, getOutages } from '@/lib/data';
import { formatClock } from '@/lib/time';
import StatusBar from '@/components/StatusBar';
import NavLinks from '@/components/NavLinks';

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

// Every view depends on the current time, so nothing is prerendered with a
// frozen "now".
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#0b1220',
};

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
    title: { default: dict.meta.title, template: dict.meta.titleTemplate },
    description: dict.meta.description,
    alternates: {
      languages: { tr: '/tr', en: '/en', 'x-default': '/tr' },
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      siteName: dict.brand,
      locale: locale === 'tr' ? 'tr_TR' : 'en_US',
      type: 'website',
    },
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

        <header className="mx-auto flex w-full max-w-[1060px] items-baseline justify-between gap-4 px-5 pt-4">
          <Link
            href={`/${locale}`}
            className="opsz-40 font-display text-body font-semibold tracking-[-0.01em] text-text no-underline"
          >
            {dict.brand}
          </Link>
          <NavLinks locale={locale} homeLabel={dict.nav.home} archiveLabel={dict.nav.archive} />
        </header>

        <main className="mx-auto w-full max-w-[1060px] flex-1 px-5 pb-2">{children}</main>

        <footer className="mt-12 border-t border-dark">
          <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-2 px-5 pb-9 pt-4">
            {/* The persistent disclaimer (§1.4): every duration is an estimate. */}
            <p className="m-0 max-w-[68ch] text-meta text-muted">{dict.footer.disclaimer}</p>
            <p className="m-0 font-mono text-meta text-muted">
              {dict.brand} ·{' '}
              {freshness.lastCheckedAt
                ? fill(dict.footer.lastChecked, { time: formatClock(freshness.lastCheckedAt, locale) })
                : dict.statusBar.neverChecked}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
