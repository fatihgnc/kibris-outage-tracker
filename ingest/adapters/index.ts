import { yeniduzen } from './yeniduzen';
import { kibrispostasi } from './kibrispostasi';
import { detaykibris } from './detaykibris';
import { gundemkibris } from './gundemkibris';
import { kibrisgazetesi } from './kibrisgazetesi';
import type { SourceAdapter } from './types';

// Five news outlets, and no adapter for the utility itself. KIB-TEK's site has
// a "Planlı Kesintiler" category, but it is empty — the WordPress API reports
// zero posts in it — and its feed carries tenders and tariffs. Polling it cost
// a request every ten minutes and returned nothing, so it was removed; if the
// utility ever starts publishing there, an adapter can come back.
//
// The outlets are real sources rather than fallbacks (§10.1): they are where
// these announcements actually appear. A single outage typically arrives four
// or five times and dedupe (§10.5) is what keeps that from becoming five
// cards.
export const adapters: SourceAdapter[] = [
  yeniduzen,
  kibrispostasi,
  detaykibris,
  gundemkibris,
  kibrisgazetesi,
];
