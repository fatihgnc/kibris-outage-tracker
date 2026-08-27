import { toLowerTr } from './text';

// True when the text looks like an outage announcement at all.
//
// This is a crawl filter, not a parser. It runs in the adapters, on the article
// body, before an announcement is emitted (§10.1) — and it is what keeps the
// volume reaching the model at a couple of articles per run instead of the
// whole crawl. The outlets publish tenders, tariffs and football through the
// same listings, and there is no reason to pay to be told so.
//
// Everything else that used to live in this file — classifying planned against
// fault against rotating, spotting a cancellation, spotting a fault already
// repaired — was keyword matching, and the model does all of it now from the
// text itself rather than from a list of words somebody remembered to add.
export function looksLikeOutage(text: string): boolean {
  const lower = toLowerTr(text);
  const mentionsPower = /elektrik|enerji/.test(lower);
  // Anchored on the actual outage words. A bare 'kesin' stem also matches
  // 'kesinlikle' ("definitely"), which pulled unrelated news into the review
  // queue on the first live run.
  // 'kesintisiz' is the opposite word ("uninterrupted"), so it is excluded.
  const mentionsCut = /kesinti(?!siz)|kesil(ecek|di|iyor|mi[şs]|ir)|kesme/.test(lower);
  return mentionsPower && mentionsCut;
}
