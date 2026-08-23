import { kibtek } from './kibtek';
import { yeniduzen } from './yeniduzen';
import { kibrispostasi } from './kibrispostasi';
import { detaykibris } from './detaykibris';
import { gundemkibris } from './gundemkibris';
import { kibrisgazetesi } from './kibrisgazetesi';
import type { SourceAdapter } from './types';

// The utility first, then the outlets. In practice the outlets are often
// faster than the utility's own site, so they are real sources rather than
// fallbacks (§10.1). A single outage typically arrives five or six times and
// dedupe (§10.5) is what keeps that from becoming five cards.
export const adapters: SourceAdapter[] = [
  kibtek,
  yeniduzen,
  kibrispostasi,
  detaykibris,
  gundemkibris,
  kibrisgazetesi,
];
