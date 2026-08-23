import { createOutletAdapter } from './outlet';

// Often carries the fullest place lists, which is why the union rule in
// dedupe (§10.5) matters: the villages only this outlet names still surface.
export const gundemkibris = createOutletAdapter({
  id: 'gundemkibris',
  name: 'Gündem Kıbrıs',
  origin: 'https://www.gundemkibris.com',
  feeds: ['https://www.gundemkibris.com/rss'],
  listings: ['https://www.gundemkibris.com/elektrik-kesintisi'],
  articlePattern: /^\/[a-z0-9-]{10,}$/i,
});
