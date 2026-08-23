import { createOutletAdapter } from './outlet';

export const kibrisgazetesi = createOutletAdapter({
  id: 'kibrisgazetesi',
  name: 'Kıbrıs Gazetesi',
  origin: 'https://www.kibrisgazetesi.com',
  feeds: ['https://www.kibrisgazetesi.com/feed/'],
});
