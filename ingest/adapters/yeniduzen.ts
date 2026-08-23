import { createOutletAdapter } from './outlet';

export const yeniduzen = createOutletAdapter({
  id: 'yeniduzen',
  name: 'Yenidüzen',
  origin: 'https://www.yeniduzen.com',
  feeds: ['https://www.yeniduzen.com/rss/'],
});
