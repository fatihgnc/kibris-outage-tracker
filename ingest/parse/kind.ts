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

// Wording that only appears when the work was scheduled in advance. Kept
// apart from PLANNED because a bare 'çalışma' ("work") is too weak to
// outrank a fault.
const PLANNED_STRONG = [
  'planlı',
  'planli',
  'programlı',
  'programli',
  'proje çalışma',
  'proje calisma',
  'bakım onarım',
  'bakim onarim',
  'bakım çalışma',
  'bakim calisma',
  'yenileme çalışma',
  'yenileme calisma',
  'şebeke iyileştirme',
  'sebeke iyilestirme',
  'arıza tamiri',
  'ariza tamiri',
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

// Wording that says the fault is over. This gates the open-ended fault record
// in parse/index.ts, which has no end time and is therefore active until
// something retires it — writing one from a story about a fault that has
// already been fixed would leave the map dark indefinitely over nothing.
//
// Completed forms only, never the bare stem. 'giderilmesi' appears in the
// middle of an ongoing fault — "arızanın giderilmesi için çalışmalar devam
// ediyor", the works to fix it are continuing — and matching 'gideril' would
// read that as the opposite of what it says.
const RESOLVED = [
  'giderildi',
  'giderilmiştir',
  'giderilmis',
  'giderilmiş',
  'normale döndü',
  'normale dondu',
  'sona erdi',
  'sona ermiştir',
  'sona ermistir',
  'yeniden verildi',
  'enerji verildi',
  'elektrikler geldi',
  'onarıldı',
  'onarildi',
];

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

// Rotating outages are worse news for the reader than planned ones and are
// checked first; a rotating announcement usually also says 'planlı'.
export function classifyKind(text: string): OutageKind {
  const lower = toLowerTr(text);
  if (containsAny(lower, ROTATING)) return 'rotating';
  // Announcements routinely give the reason as scheduled work *and* a fault
  // repair: "proje çalışması ve arıza tamiri nedeniyle ... yapılacak". Work
  // announced ahead with a time window is planned by definition (§10.4) — the
  // word 'arıza' there names the reason, not an unplanned interruption. So a
  // strong planned marker outranks an incidental fault mention.
  const scheduled = containsAny(lower, PLANNED_STRONG);
  if (containsAny(lower, FAULT) && !scheduled) return 'fault';
  if (scheduled || containsAny(lower, PLANNED)) return 'planned';
  return 'planned';
}

// True when the announcement reports the outage as already over. See RESOLVED:
// only Stage 1's open-ended fault path consults this, and only to decline.
export function isResolved(text: string): boolean {
  return containsAny(toLowerTr(text), RESOLVED);
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
