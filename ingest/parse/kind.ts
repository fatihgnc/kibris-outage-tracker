import type { OutageKind } from '../../lib/types';
import { toLowerTr } from './text';

// Classification keywords, folded to lowercase Turkish before matching.
// Order matters: cancellation and fault wording override maintenance wording,
// because an announcement often describes the planned work that a fault
// interrupted.
const ROTATING = [
  'dönüşümlü',
  'donusumlu',
  'rotasyon',
  'yük atma',
  'yuk atma',
  'puant',
  'kapasite yetersiz',
  'üretim yetersiz',
  'uretim yetersiz',
  'arz açığı',
  'arz acigi',
];

const FAULT = [
  'arıza',
  'ariza',
  'beklenmedik',
  'plansız',
  'plansiz',
  'ani kesinti',
  'kaza',
  'hasar',
  'kopan',
  'patlama',
  'yıldırım',
  'yildirim',
];

const PLANNED = [
  'planlı',
  'planli',
  'bakım',
  'bakim',
  'onarım',
  'onarim',
  'çalışma',
  'calisma',
  'yenileme',
  'proje',
  'şebeke iyileştirme',
  'sebeke iyilestirme',
  'programlı',
  'programli',
];

const CANCELLATION = [
  'iptal edilmiştir',
  'iptal edilmistir',
  'iptal edildi',
  'ertelenmiştir',
  'ertelenmistir',
  'ertelendi',
  'yapılmayacaktır',
  'yapilmayacaktir',
  'gerçekleşmeyecek',
  'gerceklesmeyecek',
];

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

// Rotating outages are worse news for the reader than planned ones and are
// checked first; a rotating announcement usually also says 'planlı'.
export function classifyKind(text: string): OutageKind {
  const lower = toLowerTr(text);
  if (containsAny(lower, ROTATING)) return 'rotating';
  if (containsAny(lower, FAULT)) return 'fault';
  if (containsAny(lower, PLANNED)) return 'planned';
  return 'planned';
}

// True when the announcement retracts a previously announced outage. Such an
// announcement updates the matching record rather than adding a new one
// (§10.6).
export function isCancellation(text: string): boolean {
  return containsAny(toLowerTr(text), CANCELLATION);
}

// True when the text looks like an outage announcement at all. The utility and
// the outlets publish tenders, tariffs, and press releases through the same
// feeds, and those must not reach the parser as failed records.
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
