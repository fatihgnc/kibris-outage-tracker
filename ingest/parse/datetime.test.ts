import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDate, parseSchedule, parseTimeRange, toSchedule } from './datetime';
import { formatClock } from '../../lib/time';

// Fixtures follow the phrasing that actually appears in KIB-TEK announcements
// and the outlets that republish them.
const PUBLISHED = '2026-08-22T14:00:00.000Z'; // 17:00 in Nicosia

test('parses the "saatleri arasında" range with dot separators', () => {
  const range = parseTimeRange('09.00 ile 15.00 saatleri arasında elektrik kesintisi olacaktır');
  assert.deepEqual(range, { startHour: 9, startMinute: 0, endHour: 15, endMinute: 0 });
});

test('parses a dash range with either separator', () => {
  assert.deepEqual(parseTimeRange('05.00-07.00 saatleri arasında'), {
    startHour: 5,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
  });
  assert.deepEqual(parseTimeRange('saat 09:30 – 13:45 arası'), {
    startHour: 9,
    startMinute: 30,
    endHour: 13,
    endMinute: 45,
  });
});

test('falls back to a start-only time when no end is announced', () => {
  assert.deepEqual(parseTimeRange('saat 14.00 itibarıyla enerji kesilecektir'), {
    startHour: 14,
    startMinute: 0,
    endHour: null,
    endMinute: null,
  });
});

test('rejects impossible clock values instead of guessing', () => {
  assert.equal(parseTimeRange('99.99 ile 88.00 saatleri arasında'), null);
  assert.equal(parseTimeRange('bugün elektrik kesintisi olacaktır'), null);
});

test('resolves a named date, inferring the year from publication', () => {
  assert.deepEqual(parseDate('23 Ağustos Cumartesi günü', PUBLISHED), { year: 2026, month: 8, day: 23 });
  assert.deepEqual(parseDate('15 Ağustos 2025 Cuma günü', PUBLISHED), { year: 2025, month: 8, day: 15 });
});

test('a January announcement published in December belongs to the next year', () => {
  const december = '2026-12-28T10:00:00.000Z';
  assert.deepEqual(parseDate('3 Ocak Pazar günü', december), { year: 2027, month: 1, day: 3 });
});

test('relative words resolve against publication, not the run time', () => {
  // Published 22 August 23:30 Nicosia; "yarın" must be the 23rd even if the
  // ingest runs after midnight.
  const lateNight = '2026-08-22T20:30:00.000Z';
  assert.deepEqual(parseDate('yarın sabah', lateNight), { year: 2026, month: 8, day: 23 });
  assert.deepEqual(parseDate('bugün', lateNight), { year: 2026, month: 8, day: 22 });
});

test('toSchedule produces UTC instants that read back as the announced clock', () => {
  const schedule = toSchedule(
    { year: 2026, month: 8, day: 23 },
    { startHour: 9, startMinute: 0, endHour: 15, endMinute: 0 },
  );
  assert.equal(formatClock(schedule.startsAt, 'tr'), '09:00');
  assert.equal(formatClock(schedule.endsAt!, 'tr'), '15:00');
});

test('an end before the start runs past midnight', () => {
  const schedule = toSchedule(
    { year: 2026, month: 8, day: 23 },
    { startHour: 23, startMinute: 0, endHour: 2, endMinute: 0 },
  );
  assert.equal(Date.parse(schedule.endsAt!) - Date.parse(schedule.startsAt), 3 * 3600000);
});

test('parseSchedule handles a full announcement sentence', () => {
  const schedule = parseSchedule(
    'Yarın 09.00 ile 15.00 saatleri arasında Gönyeli bölgesinde elektrik kesintisi yapılacaktır.',
    PUBLISHED,
  );
  assert.ok(schedule);
  assert.equal(formatClock(schedule.startsAt, 'tr'), '09:00');
  assert.equal(formatClock(schedule.endsAt!, 'tr'), '15:00');
  assert.equal(schedule.startsAt.slice(0, 10), '2026-08-23');
});

test('parseSchedule defaults to the publication date when none is stated', () => {
  const schedule = parseSchedule('10.00 ile 12.00 saatleri arasında kesinti', PUBLISHED);
  assert.ok(schedule);
  assert.equal(schedule.startsAt.slice(0, 10), '2026-08-22');
});
