import { ImageResponse } from 'next/og';
import { isLocale, locales } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { islandDataUri } from '@/lib/og-island';

// A single alt string serves both locales, so it is written in Turkish to
// match `defaultLocale` — the same compromise `manifest.ts` makes, and for the
// same reason: this export has no request to read a locale from.
export const alt = 'kesintimivar.com — Kuzey Kıbrıs elektrik kesintileri';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Prerendered per locale. Nothing here reads the request, and a card drawn at
// build time is a card no crawler has to wait for.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = await getDictionary(isLocale(locale) ? locale : 'tr');

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#0b1220',
          position: 'relative',
        }}
      >
        {/* The island bleeds off the right edge: enough of it to be recognised
          * at thumbnail size, not so much that it becomes the subject. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- satori draws
          * into a raster, where next/image has nothing to optimise. */}
        <img
          alt=""
          src={islandDataUri()}
          width={1180}
          height={684}
          style={{ position: 'absolute', right: -170, bottom: -110 }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative',
            width: 660,
            height: '100%',
            padding: '0 72px',
          }}
        >
          {/* One lit lamp, the site's whole vocabulary in a single mark. */}
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: '#f5c86b',
              marginBottom: 28,
            }}
          />
          <div style={{ fontSize: 68, color: '#c9d1dc', letterSpacing: '-0.02em' }}>{dict.brand}</div>
          <div style={{ fontSize: 32, color: '#7c8699', marginTop: 18, lineHeight: 1.35 }}>
            {dict.meta.share}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
