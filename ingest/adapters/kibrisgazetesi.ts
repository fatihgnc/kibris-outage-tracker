import { createOutletAdapter } from './outlet';

export const kibrisgazetesi = createOutletAdapter({
  id: 'kibrisgazetesi',
  name: 'Kıbrıs Gazetesi',
  origin: 'https://kibrisgazetesi.com',
  sitemaps: ['https://kibrisgazetesi.com/news-sitemap.xml'],
});
