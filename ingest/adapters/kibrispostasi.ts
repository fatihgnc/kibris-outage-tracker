import { createOutletAdapter } from './outlet';

// No usable feed, so the national news category listing is read instead and
// each candidate article is checked before it is fetched further.
export const kibrispostasi = createOutletAdapter({
  id: 'kibrispostasi',
  name: 'Kıbrıs Postası',
  origin: 'https://www.kibrispostasi.com',
  listings: ['https://www.kibrispostasi.com/c35-KIBRIS_HABERLERI'],
  // Article paths carry the numeric id: /c35-KIBRIS_HABERLERI/n611590-slug
  articlePattern: /\/n\d{4,}-/i,
});
