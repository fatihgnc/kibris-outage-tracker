import { createOutletAdapter } from './outlet';

// A Google News sitemap: ~30 KB covering the last couple of days, which is
// exactly the window a ten-minute poll needs.
export const gundemkibris = createOutletAdapter({
  id: 'gundemkibris',
  name: 'Gündem Kıbrıs',
  origin: 'https://www.gundemkibris.com',
  sitemaps: ['https://www.gundemkibris.com/sitemap-news.xml'],
});
