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

// Either provider can drive Stage 2 — whichever key is present. Only the
// request shape and where the text sits in the response differ; validation,
// place matching and record building below are identical either way.
type Provider = {
  name: 'openai' | 'anthropic';
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  extract(payload: unknown): string;
};

// Overridable, because model availability differs per account.
const OPENAI_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5';

export function selectProvider(system: string, user: string): Provider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
      body: {
        model: OPENAI_MODEL,
        max_completion_tokens: 1024,
        // The system prompt already demands a JSON object, which this enforces.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      extract: (payload) => {
        const choices = (payload as { choices?: { message?: { content?: string } }[] }).choices ?? [];
        return choices[0]?.message?.content ?? '';
      },
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      name: 'anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      },
      extract: (payload) => {
        const blocks = (payload as { content?: { type: string; text?: string }[] }).content ?? [];
        return blocks
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');
      },
    };
  }

  return null;
}

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
  const publishedDate = announcement.publishedAt.slice(0, 10);
  const userText = `Publication date: ${publishedDate}\n\nTitle: ${announcement.title}\n\nBody:\n${announcement.body.slice(0, 6000)}`;

  // No key configured: Stage 2 is simply skipped and the announcement goes to
  // the review queue with its raw text. It is never silently dropped.
  const provider = selectProvider(SYSTEM_PROMPT, userText);
  if (!provider) return null;

  let raw: string;
  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: provider.headers,
      body: JSON.stringify(provider.body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      console.warn(`[fallback] ${provider.name} returned ${response.status} for ${announcement.source.url}`);
      return null;
    }
    raw = provider.extract(await response.json());
  } catch (error) {
    console.warn(`[fallback] ${provider.name} request failed: ${(error as Error).message}`);
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
