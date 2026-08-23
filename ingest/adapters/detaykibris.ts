import { createOutletAdapter } from './outlet';

// No compact news sitemap here — the only one is a 9 MB full archive, far too
// heavy to pull every ten minutes. The homepage is ~120 KB and carries the
// recent headlines, which is all a poll needs.
export const detaykibris = createOutletAdapter({
  id: 'detaykibris',
  name: 'Detay Kıbrıs',
  origin: 'https://www.detaykibris.com',
  listings: ['https://www.detaykibris.com/'],
  articlePattern: /-\d+h\.htm$/i,
});
