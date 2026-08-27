import type { Outage, OutageStatus } from './types';
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

// UTC instant whose wall clock in Europe/Nicosia matches the given fields.
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute = 0): number {
  const want = Date.UTC(year, month - 1, day, hour, minute);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const w = wallClock(guess);
    const got = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
    if (got === want) break;
    guess += want - got;
  }
  return guess;
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
 * Twelve hours. Planned work runs two to six; a fault still out after half a day
 * is exceptional, and an evening one clears by morning rather than sitting there
 * all of the next day. Both directions of error are real — assume too early and
 * the map says the power is back when it is not; too late and it holds a village
 * dark that is fine — and the second is the one that compounds, because nothing
 * else ever corrects it.
 *
 * Deliberately not written to `endsAt`. That field means "the announced end",
 * and filling it with a guess would make an assumption indistinguishable from
 * something KIB-TEK actually said. The record stays honest; only the reading of
 * it is bounded. A real end still arrives two ways: the utility announcing one,
 * or a follow-up article reporting the fault fixed (§10.6).
 */
export const NO_END_ASSUMED_OVER_MS = 12 * 60 * 60 * 1000;

export function deriveStatus(outage: Pick<Outage, 'startsAt' | 'endsAt'>, now: number): OutageStatus {
  const start = Date.parse(outage.startsAt);
  const end = outage.endsAt ? Date.parse(outage.endsAt) : start + NO_END_ASSUMED_OVER_MS;
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
export function formatTimeRange(outage: Pick<Outage, 'startsAt' | 'endsAt'>, locale: Locale, dict: Dictionary): string {
  const start = formatClock(outage.startsAt, locale);
  const end = outage.endsAt ? formatClock(outage.endsAt, locale) : dict.card.endUnknown;
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
  if (days > 0) return `${days} ${dict.day} ${hours} ${dict.hour}`;
  if (hours > 0) return `${hours} ${dict.hour} ${minutes} ${dict.minute}`;
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
