import type { Outage, OutageKind } from '../../lib/types';
import { zonedTimeToUtc } from '../../lib/time';
import { fingerprint } from '../fingerprint';
import type { RawAnnouncement } from './index';
import { isCancellation } from './kind';
import { matchPlaces } from './places';

// Stage 2 (§10.4). Only for announcements Stage 1 could not fully parse.
// Volume is a few hundred a month, so cost is negligible — but the fallback
// exists to catch the tail, not to do the work. Results are marked
// confidence: 'low' and the response is validated before it is trusted.

const MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You extract structured facts from Turkish electricity outage announcements from Northern Cyprus.

Return ONLY a JSON object, no prose and no code fences, matching:
{"outages":[{"kind":"planned|fault|rotating","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM or null","areas":["settlement name", ...]}]}

Rules:
- "start"/"end" are 24-hour local times. Use null for "end" when no end time is announced (typical for faults).
- Resolve relative words such as "bugün"/"yarın" against the announcement's publication date, which is given to you.
- "areas" are the settlement or neighbourhood names exactly as written in the announcement, in Turkish. Do not translate or transliterate them.
- kind: "planned" for scheduled maintenance or project work, "fault" for an unplanned failure, "rotating" for load shedding driven by a supply shortfall.
- If the text is not an outage announcement, or you cannot find a time, return {"outages":[]}. Never guess a time.`;

type FallbackOutage = {
  kind: string;
  date: string;
  start: string;
  end: string | null;
  areas: string[];
};

export type FallbackResult = { records: Outage[]; cancellation: boolean };

export async function runFallback(announcement: RawAnnouncement): Promise<FallbackResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const publishedDate = announcement.publishedAt.slice(0, 10);
  const userText = `Publication date: ${publishedDate}\n\nTitle: ${announcement.title}\n\nBody:\n${announcement.body.slice(0, 6000)}`;

  let raw: string;
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userText }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
    raw = (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
  } catch {
    return null;
  }

  const parsed = validate(raw);
  if (!parsed || parsed.length === 0) return null;

  const cancellation = isCancellation(`${announcement.title} ${announcement.body}`);
  const records: Outage[] = [];

  for (const candidate of parsed) {
    // Place names go back through our own matcher, so the district is derived
    // from data/places.json rather than from anything the model asserted.
    const matches = matchPlaces(candidate.areas.join(', '));
    if (matches.length === 0) continue;

    const startsAt = toIso(candidate.date, candidate.start);
    const endsAt = candidate.end ? toIso(candidate.date, candidate.end) : null;
    if (!startsAt) continue;

    const districts = [...new Set(matches.map((match) => match.district))];
    for (const district of districts) {
      const areas = matches.filter((match) => match.district === district).map((match) => match.name);
      records.push({
        id: fingerprint({ startsAt, endsAt, areas }),
        utility: 'electricity',
        kind: candidate.kind as OutageKind,
        startsAt,
        endsAt: endsAt && endsAt <= startsAt ? shiftDay(endsAt) : endsAt,
        district,
        areas,
        sources: [announcement.source],
        publishedAt: announcement.publishedAt,
        ingestedAt: announcement.fetchedAt,
        confidence: 'low',
      });
    }
  }

  return records.length > 0 ? { records, cancellation } : null;
}

// Never trust the shape: the response is validated against the expected schema
// before any of it is accepted.
export function validate(raw: string): FallbackOutage[] | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const list = (payload as { outages?: unknown }).outages;
  if (!Array.isArray(list)) return null;

  const validated: FallbackOutage[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    const { kind, date, start, end, areas } = candidate;
    if (kind !== 'planned' && kind !== 'fault' && kind !== 'rotating') continue;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (typeof start !== 'string' || !isClock(start)) continue;
    if (end !== null && (typeof end !== 'string' || !isClock(end))) continue;
    if (!Array.isArray(areas) || areas.length === 0) continue;
    const names = areas.filter((area): area is string => typeof area === 'string' && area.trim().length > 1);
    if (names.length === 0) continue;
    validated.push({ kind, date, start, end: (end as string | null) ?? null, areas: names });
  }
  return validated;
}

function isClock(value: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function toIso(date: string, clock: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = clock.split(':').map(Number);
  if (!year || !month || !day) return null;
  // Reuses the same zone conversion as the rules parser so both stages agree.
  return new Date(zonedTimeToUtc(year, month, day, hour, minute)).toISOString();
}

function shiftDay(iso: string): string {
  return new Date(Date.parse(iso) + 86400000).toISOString();
}
