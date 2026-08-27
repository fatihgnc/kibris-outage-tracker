import { nicosiaWallClock, zonedTimeToUtc } from '../../lib/time';
import { toLowerTr } from './text';

export type TimeRange = {
  startHour: number;
  startMinute: number;
  endHour: number | null;
  endMinute: number | null;
};

export type ParsedSchedule = {
  startsAt: string; // ISO 8601
  endsAt: string | null; // null = end time unknown
};

// Announcement prose is formulaic. Ranges appear as:
//   '09.00 ile 15.00 saatleri arasında'
//   '09:00 - 15:00 saatleri arasında'
//   '09.00 – 15.00'
//   'saat 14.00'te'  (start only)
// The dot separator is normalised to a colon.
const RANGE_PATTERNS: RegExp[] = [
  /(\d{1,2})[.:](\d{2})\s*(?:ile|il[ae])\s*(\d{1,2})[.:](\d{2})\s*saatleri\s*aras[ıi]nda/i,
  /(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/,
  /(\d{1,2})[.:](\d{2})\s*(?:ile|il[ae])\s*(\d{1,2})[.:](\d{2})/i,
  /saat\s*(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/i,
];

const START_ONLY_PATTERN = /saat\s*(\d{1,2})[.:](\d{2})/i;

export function parseTimeRange(text: string): TimeRange | null {
  for (const pattern of RANGE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const range = {
      startHour: Number(match[1]),
      startMinute: Number(match[2]),
      endHour: Number(match[3]),
      endMinute: Number(match[4]),
    };
    if (!isValidClock(range.startHour, range.startMinute)) continue;
    if (!isValidClock(range.endHour, range.endMinute)) continue;
    return range;
  }
  const startOnly = START_ONLY_PATTERN.exec(text);
  if (startOnly) {
    const startHour = Number(startOnly[1]);
    const startMinute = Number(startOnly[2]);
    if (isValidClock(startHour, startMinute)) {
      return { startHour, startMinute, endHour: null, endMinute: null };
    }
  }
  return null;
}

function isValidClock(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

const MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
};

export type CalendarDate = { year: number; month: number; day: number };

// Announcements name the day as often as they say "yarın": KIB-TEK publishes on
// Wednesday that the work is "perşembe günü". Without this the date fell back
// to the publication date, which put the outage on the wrong day and — because
// the date is part of the record fingerprint — stopped the day-before and
// day-of stories about one outage from collapsing into a single record.
//
// Longest first, so 'cumartesi' is not read as 'cuma' and 'pazartesi' not as
// 'pazar'.
// Matched against the letter-folded text, which is ASCII. Writing the Turkish letters
// into the pattern instead makes the match depend on which Unicode
// normalisation the outlet's HTML happens to use — the same word can arrive
// precomposed or as a letter plus a combining mark, and only one of them
// matches. Folding first also picks up the 'persembe' spelling several
// outlets publish.
const WEEKDAYS: [RegExp, number][] = [
  [/\bcumartesi\b/, 6],
  [/\bpazartesi\b/, 1],
  [/\bcarsamba\b/, 3],
  [/\bpersembe\b/, 4],
  [/\bsali\b/, 2],
  [/\bcuma\b/, 5],
  [/\bpazar\b/, 0],
];

// The next occurrence at or after publication: an announcement is about work
// still to come, and one published on the day itself says "perşembe" too.
function nextWeekday(published: CalendarDate, weekday: number): CalendarDate {
  const publishedDow = new Date(Date.UTC(published.year, published.month - 1, published.day)).getUTCDay();
  return shiftDays(published, (weekday - publishedDow + 7) % 7);
}

const RELATIVE_DAYS: [RegExp, number][] = [
  [/\byar[ıi]n\b/, 1],
  [/\bbug[üu]n\b/, 0],
  [/\bd[üu]n\b/, -1],
];

// Every signal a text can carry about which day the work falls on, with where
// it was found. The position is what decides between them (see parseDate).
type DateSignal = { date: CalendarDate; index: number; rank: number };

// Only breaks a tie between two signals starting at the same index, which takes
// an overlap like a weekday inside a longer date phrase. An explicit calendar
// date says more than a relative word, which says more than a bare weekday.
const EXPLICIT = 0;
const RELATIVE = 1;
const WEEKDAY = 2;

// foldKey collapses runs of punctuation to one space and trims, so a position
// in its output does not line up with one in the original. The weekday scan
// needs a position comparable with the other patterns', so fold letter by
// letter instead: same ASCII result for these patterns, one character in and
// one character out, indices intact.
const LETTER_FOLDS: Record<string, string> = {
  ı: 'i',
  ğ: 'g',
  ü: 'u',
  ş: 's',
  ö: 'o',
  ç: 'c',
  â: 'a',
  î: 'i',
  û: 'u',
};

function foldLetters(lower: string): string {
  let folded = '';
  for (const character of lower) folded += LETTER_FOLDS[character] ?? character;
  return folded;
}

// Resolves the announcement's date. Relative words are resolved against the
// announcement's own publishedAt, never the run time — a job running at 00:05
// must not read yesterday's 'yarın' as today (§10.4).
//
// Where a story carries several date signals, the earliest one in the text
// wins, because the text arrives as "title. body" and a news story states the
// operative fact in its headline and lead. Anything contradicting it further
// down is leftover: outlets edit these announcements in place, and
// kibrispostasi n611748 is the case that forced this rule — the lead was
// updated from "yarın" to "bugün" on the morning of the outage while the
// paragraph below it kept saying "yarın". Reading the words in a fixed order
// let the stale one win and moved a real outage a day into the future.
export function parseDate(text: string, publishedAt: string): CalendarDate | null {
  const published = nicosiaWallClock(Date.parse(publishedAt));
  // One source string for every detector, so their positions are comparable.
  // NFC first: the same word arrives precomposed from one outlet and as a
  // letter plus a combining mark from another, and only the composed form
  // folds a character at a time.
  const lower = toLowerTr(text).normalize('NFC');
  const folded = foldLetters(lower);
  const signals: DateSignal[] = [];

  // '15 Ağustos 2026' or '15 Ağustos'
  const named = /(\d{1,2})\s+([a-zçğıöşü]+)\s*(\d{4})?/.exec(lower);
  if (named) {
    const month = MONTHS[foldMonth(named[2])];
    if (month) {
      const day = Number(named[1]);
      const year = named[3] ? Number(named[3]) : inferYear(published, month);
      if (isValidDate(year, month, day)) {
        signals.push({ date: { year, month, day }, index: named.index, rank: EXPLICIT });
      }
    }
  }

  // '15.08.2026' or '15/08/2026'
  const numeric = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(lower);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (isValidDate(year, month, day)) {
      signals.push({ date: { year, month, day }, index: numeric.index, rank: EXPLICIT });
    }
  }

  for (const [pattern, offset] of RELATIVE_DAYS) {
    const match = pattern.exec(lower);
    if (match) signals.push({ date: shiftDays(published, offset), index: match.index, rank: RELATIVE });
  }

  for (const [pattern, weekday] of WEEKDAYS) {
    const match = pattern.exec(folded);
    if (match) signals.push({ date: nextWeekday(published, weekday), index: match.index, rank: WEEKDAY });
  }

  if (signals.length === 0) return null;
  signals.sort((a, b) => a.index - b.index || a.rank - b.rank);
  return signals[0].date;
}

function foldMonth(word: string): string {
  return word
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

// Announcements omit the year. A month more than six ahead of the publication
// month belongs to the previous year, and vice versa.
function inferYear(published: { year: number; month: number }, month: number): number {
  const delta = month - published.month;
  if (delta > 6) return published.year - 1;
  if (delta < -6) return published.year + 1;
  return published.year;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 2000 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function shiftDays(from: { year: number; month: number; day: number }, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(from.year, from.month - 1, from.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

// Combines a date and a time range into UTC instants. An end earlier than the
// start means the work runs past midnight.
export function toSchedule(date: CalendarDate, range: TimeRange): ParsedSchedule {
  const startsAt = zonedTimeToUtc(date.year, date.month, date.day, range.startHour, range.startMinute);
  if (range.endHour === null || range.endMinute === null) {
    return { startsAt: new Date(startsAt).toISOString(), endsAt: null };
  }
  let endsAt = zonedTimeToUtc(date.year, date.month, date.day, range.endHour, range.endMinute);
  if (endsAt <= startsAt) endsAt += 86400000;
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() };
}

export function parseSchedule(text: string, publishedAt: string): ParsedSchedule | null {
  const range = parseTimeRange(text);
  if (!range) return null;
  const date = parseDate(text, publishedAt) ?? nicosiaDateOf(publishedAt);
  return toSchedule(date, range);
}

function nicosiaDateOf(iso: string): CalendarDate {
  const wall = nicosiaWallClock(Date.parse(iso));
  return { year: wall.year, month: wall.month, day: wall.day };
}
