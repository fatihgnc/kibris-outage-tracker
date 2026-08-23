// Turkish-aware text helpers shared by the parsers.
//
// A naive toLowerCase() corrupts Turkish place names: 'İSKELE'.toLowerCase()
// yields 'i̇skele' (i + combining dot) in most environments, and 'I' folds to
// 'i' rather than 'ı'. Every case operation in the ingest goes through here.

export function toLowerTr(value: string): string {
  return value.replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr');
}

export function toUpperTr(value: string): string {
  return value.replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr');
}

// Case-folded, accent-stripped, punctuation-free form used as the comparison
// key. Announcements spell the same village as 'Gönyeli', 'Gonyeli', and
// 'GONYELI'; all three fold to 'gonyeli'.
export function foldKey(value: string): string {
  return toLowerTr(value)
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Strips Turkish suffixes that attach to place names in announcement prose:
// "Gönyeli'de", "Lefkoşa'nın", "Girne bölgesinde". Only the apostrophe form is
// removed here; bare suffixes are handled by matching the longest place name
// at a word boundary instead of by stripping, which is safer.
export function stripApostropheSuffix(value: string): string {
  return value.replace(/['’´`][a-zçğıöşüA-ZÇĞİÖŞÜ]{1,6}\b/g, '');
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// Strips tags and decodes the entities that actually appear in these feeds.
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = withoutBlocks
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return collapseLines(decodeEntities(withBreaks.replace(/<[^>]+>/g, ' ')));
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    hellip: '…',
    ndash: '–',
    mdash: '—',
    rsquo: '’',
    lsquo: '‘',
    ldquo: '“',
    rdquo: '”',
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function collapseLines(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// Levenshtein-based similarity in [0, 1], used only for near-miss place
// matching above a high threshold. Every fuzzy hit is logged for review.
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = new Array<number>(cols);
  let current = new Array<number>(cols);
  for (let j = 0; j < cols; j++) previous[j] = j;
  for (let i = 1; i < rows; i++) {
    current[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  const distance = previous[cols - 1];
  return 1 - distance / Math.max(a.length, b.length);
}
