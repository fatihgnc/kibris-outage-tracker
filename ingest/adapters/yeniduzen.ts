import { createOutletAdapter } from './outlet';

// As with detaykibris: the only sitemap is a multi-megabyte archive, so the
// homepage is the polite listing for a frequent poll.
export const yeniduzen = createOutletAdapter({
  id: 'yeniduzen',
  name: 'Yenidüzen',
  origin: 'https://www.yeniduzen.com',
  listings: ['https://www.yeniduzen.com/'],
  articlePattern: /-\d+h\.htm$/i,
});
