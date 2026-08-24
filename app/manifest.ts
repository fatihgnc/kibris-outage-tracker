import type { MetadataRoute } from 'next';
import { tr } from '@/lib/i18n/tr';

export const dynamic = 'force-static';

// A web manifest is a single document with no request context, so it cannot
// follow the per-visit locale the way pages do; it carries the Turkish strings,
// matching `defaultLocale`. `start_url` stays locale-less on purpose — proxy.ts
// resolves it from the cookie, so an installed app opens in the language the
// visitor last chose.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${tr.brand} — Kuzey Kıbrıs elektrik kesintileri`,
    short_name: tr.brand,
    description: tr.meta.description,
    lang: 'tr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b1220',
    theme_color: '#0b1220',
    categories: ['utilities', 'news'],
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
