import type { DistrictId, MonthlyTotal, Outage, SourceRef } from './types';
import { nicosiaWallClock, zonedTimeToUtc } from './time';

// Mock records are generated relative to the injected "now" so the home page
// always has active, upcoming, and past outages to render. Times are always on
// the hour or half hour, like real announcements.
//
// The ids are 32-character hex like the real ones (§10.5), not 'o-001'. An
// outage's page is addressed by the leading characters of its id, so a mock id
// in a different shape is not merely cosmetic: every detail link 404s under
// USE_MOCKS=true, which is the mode the pages are built in.

const KIBTEK: SourceRef = {
  name: 'KIB-TEK',
  url: 'https://www.kibtek.com/kesintiler/',
  kind: 'official',
};

const press = (name: string, url: string): SourceRef => ({ name, url, kind: 'press' });

const YENIDUZEN = press('Yenidüzen', 'https://www.yeniduzen.com/elektrik-kesintisi');
const KIBRIS_POSTASI = press('Kıbrıs Postası', 'https://www.kibrispostasi.com/elektrik-kesintisi');
const GUNDEM_KIBRIS = press('Gündem Kıbrıs', 'https://www.gundemkibris.com/kibris/elektrik-kesintisi');

export function getMockOutages(now: number): Outage[] {
  // Flooring UTC ms to the hour lands on the hour in Nicosia too — the zone
  // offset is a whole number of hours.
  const hourFloor = now - (now % 3600000);
  const rel = (hours: number) => new Date(hourFloor + hours * 3600000).toISOString();
  const today = nicosiaWallClock(now);
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const base = zonedTimeToUtc(today.year, today.month, today.day, 12) + dayOffset * 86400000;
    const d = nicosiaWallClock(base);
    return new Date(zonedTimeToUtc(d.year, d.month, d.day, hour, minute)).toISOString();
  };
  const minutesAfter = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60000).toISOString();

  const records: Outage[] = [
    // Active
    {
      id: '1ec7522fe22271f266b1ea841f2ef4a2',
      utility: 'electricity',
      kind: 'planned',
      startsAt: rel(-2),
      endsAt: rel(2),
      district: 'lefkosa',
      areas: ['Gönyeli', 'Hamitköy', 'Alayköy'],
      sources: [KIBTEK, YENIDUZEN],
      publishedAt: at(-1, 17, 0),
      ingestedAt: minutesAfter(at(-1, 17, 0), 10),
      confidence: 'high',
    },
    {
      id: 'f8c4df7fb73e24db753a3fd68be13107',
      utility: 'electricity',
      kind: 'fault',
      startsAt: rel(-1.5),
      endsAt: null,
      district: 'gazimagusa',
      areas: ['Yeniboğaziçi', 'Mutluyaka'],
      sources: [KIBTEK, GUNDEM_KIBRIS],
      publishedAt: rel(-2),
      ingestedAt: minutesAfter(rel(-2), 5),
      confidence: 'high',
    },
    // Upcoming
    {
      id: 'ed00e6c964cf37610a13fd90b1d7024c',
      utility: 'electricity',
      kind: 'planned',
      startsAt: rel(2),
      endsAt: rel(6),
      district: 'girne',
      areas: ['Lapta', 'Alsancak', 'Karaoğlanoğlu'],
      sources: [KIBTEK, YENIDUZEN, KIBRIS_POSTASI],
      publishedAt: at(-1, 16, 30),
      ingestedAt: minutesAfter(at(-1, 16, 30), 10),
      confidence: 'high',
    },
    {
      id: 'c37dd39ed9c9671ffef5b59f81533766',
      utility: 'electricity',
      kind: 'rotating',
      startsAt: rel(3.5),
      endsAt: rel(5.5),
      district: 'iskele',
      areas: ['Kumyalı', 'Boğaztepe'],
      sources: [KIBTEK, KIBRIS_POSTASI],
      publishedAt: at(-1, 18, 0),
      ingestedAt: minutesAfter(at(-1, 18, 0), 10),
      confidence: 'high',
    },
    {
      id: '05be686d15cff28ce8d3562169021a79',
      utility: 'electricity',
      kind: 'planned',
      startsAt: at(1, 9, 0),
      endsAt: at(1, 15, 0),
      district: 'guzelyurt',
      areas: ['Zümrütköy', 'Kalkanlı'],
      sources: [KIBTEK],
      publishedAt: at(-1, 10, 0),
      ingestedAt: minutesAfter(at(-1, 10, 0), 10),
      confidence: 'high',
    },
    {
      id: '6c5402dcc8e8c7929f9773aaf709fd68',
      utility: 'electricity',
      kind: 'planned',
      startsAt: at(2, 10, 0),
      endsAt: at(2, 14, 0),
      district: 'lefke',
      areas: ['Gemikonağı', 'Doğancı', 'Yeşilyurt'],
      sources: [KIBTEK, YENIDUZEN],
      publishedAt: at(-1, 9, 30),
      ingestedAt: minutesAfter(at(-1, 9, 30), 10),
      confidence: 'high',
    },
    {
      id: 'dea47baf032f3e2e8a81b1af9dcb6260',
      utility: 'electricity',
      kind: 'rotating',
      startsAt: at(1, 13, 0),
      endsAt: at(1, 15, 0),
      district: 'gazimagusa',
      areas: ['Ergenekon', 'Gönendere'],
      sources: [GUNDEM_KIBRIS],
      publishedAt: at(-1, 20, 30),
      ingestedAt: minutesAfter(at(-1, 20, 30), 10),
      confidence: 'low',
    },
    // Past
    {
      id: '20f551125b59da1d9734caca5c076c31',
      utility: 'electricity',
      kind: 'fault',
      startsAt: at(-1, 19, 0),
      endsAt: at(-1, 21, 30),
      district: 'girne',
      areas: ['Çatalköy', 'Ozanköy'],
      sources: [KIBTEK, YENIDUZEN],
      publishedAt: at(-1, 18, 30),
      ingestedAt: minutesAfter(at(-1, 18, 30), 5),
      confidence: 'high',
    },
    {
      id: 'aa9d08e0b0a0da1d4e7cacb17f4d5ec5',
      utility: 'electricity',
      kind: 'planned',
      startsAt: at(-2, 9, 0),
      endsAt: at(-2, 13, 0),
      district: 'lefkosa',
      areas: ['Değirmenlik', 'Haspolat'],
      sources: [KIBTEK, KIBRIS_POSTASI],
      publishedAt: at(-4, 16, 0),
      ingestedAt: minutesAfter(at(-4, 16, 0), 10),
      confidence: 'high',
    },
    {
      id: 'a4ba69f6f06a21301bc7e35489a02906',
      utility: 'electricity',
      kind: 'planned',
      startsAt: at(-12, 9, 0),
      endsAt: at(-12, 15, 0),
      district: 'iskele',
      areas: ['Kumyalı', 'Pınarlı'],
      sources: [KIBTEK],
      publishedAt: at(-13, 15, 0),
      ingestedAt: minutesAfter(at(-13, 15, 0), 10),
      confidence: 'high',
    },
    {
      id: '153b97aad1f2a8acd58b165282f8cbd2',
      utility: 'electricity',
      kind: 'rotating',
      startsAt: at(-30, 9, 0),
      endsAt: at(-30, 12, 0),
      district: 'gazimagusa',
      areas: ['Akdoğan', 'Gönendere', 'Tirmen'],
      sources: [KIBTEK, GUNDEM_KIBRIS],
      publishedAt: at(-31, 17, 0),
      ingestedAt: minutesAfter(at(-31, 17, 0), 10),
      confidence: 'high',
    },
    {
      id: '05ebc035c265522e7a44680387d130e8',
      utility: 'electricity',
      kind: 'fault',
      startsAt: at(-45, 14, 0),
      endsAt: at(-45, 16, 0),
      district: 'guzelyurt',
      areas: ['Kalkanlı'],
      sources: [KIBTEK],
      publishedAt: at(-45, 13, 30),
      ingestedAt: minutesAfter(at(-45, 13, 30), 5),
      confidence: 'high',
    },
    {
      id: '5071ec31252653675ac54379b72276df',
      utility: 'electricity',
      kind: 'planned',
      startsAt: at(-68, 9, 0),
      endsAt: at(-68, 15, 0),
      district: 'girne',
      areas: ['Sütlüce', 'Esentepe'],
      sources: [KIBTEK, YENIDUZEN],
      publishedAt: at(-69, 16, 0),
      ingestedAt: minutesAfter(at(-69, 16, 0), 10),
      confidence: 'high',
    },
    {
      id: '59e12a86a6320fc9b979951343ab7b9b',
      utility: 'electricity',
      kind: 'fault',
      startsAt: at(-100, 15, 0),
      endsAt: at(-100, 17, 0),
      district: 'lefkosa',
      areas: ['Ulukışla'],
      sources: [KIBRIS_POSTASI],
      publishedAt: at(-100, 14, 30),
      ingestedAt: minutesAfter(at(-100, 14, 30), 5),
      confidence: 'low',
    },
    // Gönyeli three times over three months. A settlement only gets a page once
    // it has a history worth reading (PLACE_PAGE_MIN_RECORDS), and without a
    // place that clears that bar these mocks cannot render the settlement page
    // at all — the fixture has to be able to draw every screen the app has.
    // Recurrence in one village is also what the real archive looks like.
    {
      id: '31f5503466f7b453d25ab71a5c8507d4',
      utility: 'electricity',
      kind: 'planned',
      startsAt: at(-38, 9, 0),
      endsAt: at(-38, 13, 0),
      district: 'lefkosa',
      areas: ['Gönyeli', 'Yenikent'],
      sources: [KIBTEK, YENIDUZEN],
      publishedAt: at(-39, 17, 0),
      ingestedAt: minutesAfter(at(-39, 17, 0), 10),
      confidence: 'high',
    },
    {
      id: 'a34e4fa8146ead495b5632934de4ad0c',
      utility: 'electricity',
      kind: 'fault',
      startsAt: at(-77, 19, 30),
      endsAt: at(-77, 22, 0),
      district: 'lefkosa',
      areas: ['Gönyeli'],
      sources: [GUNDEM_KIBRIS],
      publishedAt: at(-77, 20, 0),
      ingestedAt: minutesAfter(at(-77, 20, 0), 5),
      confidence: 'high',
    },
  ];
  return records;
}

// Deterministic per-district monthly totals so the twelve-month chart has
// stable, plausible magnitudes: planned work dominates, faults stay small.
export function getMockMonthlyTotals(district: DistrictId, now: number): MonthlyTotal[] {
  let seed = 7;
  for (let i = 0; i < district.length; i++) seed = (seed * 31 + district.charCodeAt(i)) % 99991;
  const random = () => {
    seed = (seed * 1103515 + 12345) % 2147483;
    return seed / 2147483;
  };
  const today = nicosiaWallClock(now);
  const totals: MonthlyTotal[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthIndex = today.month - 1 - i;
    const year = today.year + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12 + 1;
    totals.push({
      month: `${year}-${String(month).padStart(2, '0')}`,
      plannedHours: 4 + Math.floor(random() * 18),
      faultHours: Math.floor(random() * 7),
    });
  }
  return totals;
}

// Stands in for the most recent successful ingest_runs row (Phase B).
export function getMockLastCheckedAt(now: number): string {
  const minuteFloor = now - (now % 60000);
  return new Date(minuteFloor - 3 * 60000).toISOString();
}
