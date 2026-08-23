import { createOutletAdapter } from './outlet';

export const detaykibris = createOutletAdapter({
  id: 'detaykibris',
  name: 'Detay Kıbrıs',
  origin: 'https://www.detaykibris.com',
  feeds: ['https://www.detaykibris.com/rss'],
  // Article paths end in the numeric id plus 'h.htm'.
  articlePattern: /-\d+h\.htm$/i,
});
