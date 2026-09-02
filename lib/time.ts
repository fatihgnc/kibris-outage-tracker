import type { MonthlyTotal, Outage, OutageStatus } from './types';
import type { Dictionary } from './i18n/dictionaries';
import { fill } from './i18n/dictionaries';
import type { Locale } from './i18n/config';

// All display happens in the island's zone regardless of where the server or
// the visitor's device is. Timestamps stay UTC ISO strings everywhere else.
export const TIME_ZONE = 'Europe/Nicosia';

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

function wallClock(ms: number): WallClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/**
 * The UTC instant whose wall clock in Europe/Nicosia matches the given fields.
 *
 * Guess, read the guess back, correct by the difference. Two passes settle it
 * for every local time that exists, because the correction is exactly the zone
 * offset.
 *
 * One local time a year does not exist. Cyprus jumps 03:00 to 04:00 on the last
 * Sunday of March, so 03:30 that night is not an instant and no guess can ever
 * read back as one. The loop used to run out of tries and return whatever it was
 * holding — which reads as 02:30, an hour *earlier* than the announcement said,
 * stored with `confidence: 'high'` and nothing anywhere recording that a guess
 * had been made. A countdown then ran out an hour before the power went off.
 *
 * Resolved forward instead: the first instant after the jump, so 03:30 becomes
 * 04:30. That is what every mainstream date library does with a gap, and it errs
 * the safer way for this site — telling a reader the power goes off later than it
 * does, rather than marking a village dark while it still has power.
 *
 * The autumn hour is the opposite case and needs no handling: 03:30 happens
 * twice, both are real instants, and the search lands on the second.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute = 0): number {
  const want = Date.UTC(year, month - 1, day, hour, minute);
  const readBack = (instant: number) => {
    const w = wallClock(instant);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  };

  let guess = want;
  for (let i = 0; i < 3; i++) {
    const got = readBack(guess);
    if (got === want) return guess;
    guess += want - got;
  }

  // No instant reads back as the wall clock asked for, so it is inside a
  // spring-forward gap. The two instants the search oscillates between sit one
  // gap apart, on either side of the jump; the later one is the first that
  // exists, and it is what a reader waiting for the power means.
  const other = guess + (want - readBack(guess));
  return Math.max(guess, other);
}

export function nicosiaWallClock(ms: number): WallClock {
  return wallClock(ms);
}

/**
 * How long an outage with no announced end is taken to still be running.
 *
 * `endsAt: null` means nobody said when the power comes back — the ordinary case
 * for a fault in progress (§10.4). Treated literally it means *forever*: the
 * record stays active until something retires it, and the live window is thirty
 * days, so a fault repaired in two hours could show villages dark for weeks.
 * That was survivable while open-ended records were 2 of 82. It stopped being
 * survivable the moment the parser started catching faults on purpose.
 *
 * Seventy-two hours. It was twelve, then twenty-four, and the honest reason for
 * the number is not a belief about how long faults last.
 *
 * Both directions of error are real — assume too early and the map says the
 * power is back when it is not; too late and it holds a village dark that is
 * fine — but they are not equally bad. An unclosed fault held too long is a card
 * that overstays, and a reader can see the hours on it. A live one dropped
 * leaves the home page saying "the island is entirely lit" in its own voice,
 * with nothing on the page to argue with.
 *
 * That second failure has now happened twice over the same three records. On 29
 * August Lefke, Girne and Güzelyurt went out at 12:29 with no announced end;
 * twelve hours retired them at 00:29 while the power was still off, and
 * twenty-four hours retired them again at 12:29 the next day, still off.
 *
 * So the number is a backstop, and it is compensating for something else. The
 * thing that is supposed to close these records is a repair report (§10.6), and
 * that path is not reaching them: the crawl's URL filter only passes an article
 * whose address contains 'elektrik' or 'enerji-veril', so 'ariza-giderildi' and
 * 'normale-dondu' never get fetched at all, whatever the body filter would have
 * made of them. Widen this constant and the site stops lying for longer; fix
 * that filter and the constant stops being what decides.
 *
 * Deliberately not written to `endsAt`. That field means "the announced end",
 * and filling it with a guess would make an assumption indistinguishable from
 * something KIB-TEK actually said. The record stays honest; only the reading of
 * it is bounded. A real end still arrives two ways: the utility announcing one,
 * or a follow-up article reporting the fault fixed (§10.6).
 */
export const NO_END_ASSUMED_OVER_MS = 72 * 60 * 60 * 1000;

/**
 * When a record is read as being over: the announced end, or the assumption
 * above. The same number `deriveStatus` decides on, exposed for the callers
 * that need the instant rather than the verdict — the map's timeline draws it.
 */
export function readEndOf(outage: Pick<Outage, 'startsAt' | 'endsAt'>): number {
  return outage.endsAt
    ? Date.parse(outage.endsAt)
    : Date.parse(outage.startsAt) + NO_END_ASSUMED_OVER_MS;
}

/** The hour on the island, 0–23. The map's night is the island's, not the reader's. */
export function islandHour(now: number): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
}

export function deriveStatus(outage: Pick<Outage, 'startsAt' | 'endsAt'>, now: number): OutageStatus {
  const start = Date.parse(outage.startsAt);
  const end = readEndOf(outage);
  if (start <= now && end > now) return 'active';
  return start > now ? 'upcoming' : 'past';
}

export function formatClock(iso: string | number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(typeof iso === 'string' ? Date.parse(iso) : iso);
}

// '09:00 – 11:00', or '09:00 – belirsiz' when the end is unknown.
//
// An end on a later day carries that day: a fault that started at 12:29 and
// was repaired three days on at 08:45 read as '12:29 – 08:45', a range that
// runs backwards on the day the card names. It is '12:29 – 1 Eyl 08:45'.
export function formatTimeRange(outage: Pick<Outage, 'startsAt' | 'endsAt'>, locale: Locale, dict: Dictionary): string {
  const start = formatClock(outage.startsAt, locale);
  if (!outage.endsAt) return `${start} – ${dict.card.endUnknown}`;
  const sameDay = calendarDayDiff(Date.parse(outage.endsAt), Date.parse(outage.startsAt)) === 0;
  const end = sameDay ? formatClock(outage.endsAt, locale) : formatDateTimeShort(outage.endsAt, locale);
  return `${start} – ${end}`;
}

function calendarDayDiff(ms: number, nowMs: number): number {
  const a = wallClock(ms);
  const b = wallClock(nowMs);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000);
}

// 'bugün, 23 Ağustos' / 'today, 23 August', or '23 Ağustos Cumartesi' /
// 'Saturday, 23 August' outside the ±1 day window. Weekday and month names
// come from the platform via Intl, relative words from the dictionary.
export function formatDayLabel(iso: string, now: number, locale: Locale, dict: Dictionary): string {
  const ms = Date.parse(iso);
  const date = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: 'numeric', month: 'long' }).format(ms);
  const diff = calendarDayDiff(ms, now);
  const relative = diff === 0 ? dict.time.today : diff === 1 ? dict.time.tomorrow : diff === -1 ? dict.time.yesterday : null;
  if (relative) return fill(dict.time.relativeDate, { relative, date });
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, weekday: 'long' }).format(ms);
  return fill(dict.time.dateWithWeekday, { date, weekday });
}

// Duration strings are built from dictionary unit fragments, never by
// concatenating a number with a fixed suffix: '2 sa 10 dk' / '2 hr 10 min'.
export function formatDuration(ms: number, dict: Pick<Dictionary['time'], 'day' | 'hour' | 'minute'>): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  // At most two units, and never a zero tail: "2 sa 0 dk" is how long nobody
  // says something lasted. The smaller unit is dropped when it is zero, so a
  // round duration reads "2 sa" and a countdown ticking past the hour still
  // reads "1 sa 59 dk".
  if (days > 0) return hours > 0 ? `${days} ${dict.day} ${hours} ${dict.hour}` : `${days} ${dict.day}`;
  if (hours > 0) return minutes > 0 ? `${hours} ${dict.hour} ${minutes} ${dict.minute}` : `${hours} ${dict.hour}`;
  return `${minutes} ${dict.minute}`;
}

// '23 Ağu 17:40' / 'Aug 23, 17:40' — for the card footer's publish time.
export function formatDateTimeShort(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(Date.parse(iso));
}

// '26 Ağustos 2026' / '26 August 2026'. The whole date, spelled out, for the
// places a record is named rather than listed: an outage page's heading, its
// title, and the sentence a search result shows. Unlike formatDayLabel it
// carries the year and never says 'bugün' — an archive page read in December
// must not describe an August outage as today's.
export function formatDateLong(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(Date.parse(iso));
}

// The freshness stamp: 'bugün 09:58' and 'dün 09:58' inside the ±1 day
// window, '19 Ağu 2026 09:58' outside it. A clock alone is only legible while
// the check is today's; once it is not, the reader needs the day, and the year
// keeps a stale deployment from reading as this morning.
export function formatUpdateStamp(iso: string, now: number, locale: Locale, dict: Dictionary): string {
  const ms = Date.parse(iso);
  const clock = formatClock(ms, locale);
  const diff = calendarDayDiff(ms, now);
  if (diff === 0) return `${dict.time.today} ${clock}`;
  if (diff === -1) return `${dict.time.yesterday} ${clock}`;
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(ms);
  return `${date} ${clock}`;
}

// The calendar year on the island, for the footer's copyright line.
export function formatYear(ms: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, year: 'numeric' }).format(ms);
}

// 'YYYY-MM' in the island's zone, for archive grouping and chart keys.
export function monthKey(iso: string): string {
  const w = wallClock(Date.parse(iso));
  return `${w.year}-${String(w.month).padStart(2, '0')}`;
}

/**
 * Twelve months of outage hours, bucketed in the island's zone.
 *
 * Shared by the district chart, which buckets a district's records, and the
 * settlement chart, which buckets one place's — two views that must not
 * disagree about how an outage is counted. The rule that matters is the last
 * one: a fault with no announced end contributes nothing rather than an
 * invented duration. The display bound in `NO_END_ASSUMED_OVER_MS` exists so a
 * card does not run forever; it is not a measurement, and a chart that spent it
 * would be publishing a number nobody announced.
 *
 * Months with no outages are present with zeroes, so the axis is always twelve
 * columns wide and a quiet month reads as quiet rather than as missing.
 */
export function bucketMonthlyTotals(
  records: readonly Pick<Outage, 'kind' | 'startsAt' | 'endsAt'>[],
  now: number,
): MonthlyTotal[] {
  const wall = wallClock(now);
  const buckets = new Map<string, MonthlyTotal>();
  for (let i = 11; i >= 0; i--) {
    const monthIndex = wall.month - 1 - i;
    const year = wall.year + Math.floor(monthIndex / 12);
    const month = (((monthIndex % 12) + 12) % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    buckets.set(key, { month: key, plannedHours: 0, faultHours: 0 });
  }

  for (const record of records) {
    const bucket = buckets.get(monthKey(record.startsAt));
    if (!bucket) continue;
    if (!record.endsAt) continue;
    const hours = (Date.parse(record.endsAt) - Date.parse(record.startsAt)) / 3600000;
    if (hours <= 0) continue;
    if (record.kind === 'fault') bucket.faultHours += hours;
    else bucket.plannedHours += hours;
  }

  return [...buckets.values()].map((bucket) => ({
    month: bucket.month,
    plannedHours: Math.round(bucket.plannedHours),
    faultHours: Math.round(bucket.faultHours),
  }));
}

export function formatMonthYear(key: string, locale: Locale): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    Date.UTC(year, month - 1, 1, 12),
  );
}

export function formatMonthShort(key: string, locale: Locale): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' }).format(Date.UTC(year, month - 1, 1, 12));
}
