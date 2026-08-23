import { createOutletAdapter } from './outlet';

// No feed and no sitemap: every candidate path — news-sitemap.xml, /arama,
// /etiket — soft-404s back to the same 167 KB page, so the category listing is
// the only way in.
//
// This outlet also files outage announcements under its district categories
// (c87-LEFKOSA, c88-GAZIMAGUSA, and so on), which are deliberately not polled.
// Seven listings at ~178 KB each would be ~180 MB a day against one site — ten
// times what any other source costs — and they send no ETag or Last-Modified,
// so a conditional request cannot avoid the download. The same announcements
// reach us through the other five outlets and are merged by dedupe, so the
// coverage lost is small and the politeness kept is not (§10.3).
export const kibrispostasi = createOutletAdapter({
  id: 'kibrispostasi',
  name: 'Kıbrıs Postası',
  origin: 'https://www.kibrispostasi.com',
  listings: ['https://www.kibrispostasi.com/c35-KIBRIS_HABERLERI'],
  // Article paths carry the numeric id: /c35-KIBRIS_HABERLERI/n611590-slug
  articlePattern: /\/n\d{4,}-/i,
});
