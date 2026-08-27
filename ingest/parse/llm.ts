import type { OutageKind } from '../../lib/types';
import type { RawAnnouncement } from './index';

// The parser (§10.4).
//
// This replaced a stack of Turkish regexes — date ranges, relative weekdays,
// keyword classification — that got the formulaic announcements right and lost
// everything else. It was not a tuning problem. "Bir iş aracının orta gerilim
// hatlarına çarpması sonucu elektrik verilemiyor" is a real outage with no
// clock in it anywhere, and no pattern list reaches prose like that. The first
// 82 stored records were 78 planned outages and 2 faults — not because faults
// are rare, but because faults are the ones written in sentences.
//
// Volume is what makes this affordable. The adapters apply `looksLikeOutage` to
// the article body before an announcement is ever emitted, and cap themselves
// at a dozen articles each, so a run carries a couple of announcements rather
// than a whole crawl — measured at 2 across all five outlets. With the seen
// list in store.ts on top, which keeps an article from being sent twice, the
// model sees each announcement once.

const MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 30000;
// A dry run against live sources hit one "fetch failed" in the middle of an
// otherwise stable sequence — the network, not the API. Left alone that costs
// the article an attempt and puts it in the review queue over a blip, so the
// transient cases get another go. A 4xx is not one of them: a bad key or a
// malformed request will fail identically however many times it is sent.
const RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const MAX_BODY_CHARS = 6000;

// Structured Outputs: the model is constrained to this shape rather than asked
// for it. `strict` also requires every property to appear in `required` and
// `additionalProperties: false` on every object, so an optional field is
// spelled as a nullable one instead.
const SCHEMA = {
  name: 'outage_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['outages'],
    properties: {
      outages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'date', 'start', 'end', 'areas', 'cancelled', 'ongoing'],
          properties: {
            kind: { type: 'string', enum: ['planned', 'fault', 'rotating'] },
            date: {
              type: 'string',
              description:
                'YYYY-MM-DD local date the outage starts, with relative words resolved against the publication date given to you.',
            },
            start: {
              type: ['string', 'null'],
              description:
                'HH:MM, 24-hour local. null only when the announcement states no start time at all, which happens for a fault already in progress.',
            },
            end: {
              type: ['string', 'null'],
              description:
                'HH:MM, 24-hour local. null when no end time is announced, which is typical for faults.',
            },
            areas: {
              type: 'array',
              description:
                'Settlement, village or neighbourhood names exactly as the announcement writes them, in Turkish. Do not translate or transliterate. Leave out businesses and buildings named only as landmarks.',
              items: { type: 'string' },
            },
            cancelled: {
              type: 'boolean',
              description:
                'true only when this announcement retracts or postpones a previously announced outage.',
            },
            ongoing: {
              type: 'boolean',
              description:
                'true when the announcement describes the outage as happening now and not yet fixed; false when it reports one already over or repaired.',
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'You extract structured facts from Turkish electricity outage announcements from Northern Cyprus (KKTC).',
  '',
  'You are given one news article. Return the outages it announces.',
  '',
  '- Return an empty list when the article is not about an electricity outage, or when it only reports one that has already been repaired.',
  '- One entry per distinct outage. An announcement listing many villages under one time window is ONE outage with many areas, not one per village.',
  '- Resolve "bugün", "yarın", "perşembe günü" and the like against the publication date you are given. A named weekday means its next occurrence on or after that date.',
  '- Never invent a time. When a fault is already in progress and no start is stated, set "start" to null and "ongoing" to true.',
  '- Planned work states its hours almost without exception. If a clearly scheduled outage gives no hours, return what you can find and leave the rest null rather than estimating.',
  '- "areas" must be the place names the announcement itself uses. Include villages, towns and neighbourhoods; leave out businesses and buildings used only as landmarks.',
].join('\n');

export type ExtractedOutage = {
  kind: OutageKind;
  date: string;
  start: string | null;
  end: string | null;
  areas: string[];
  cancelled: boolean;
  ongoing: boolean;
};

export type ExtractionResult =
  | { status: 'ok'; outages: ExtractedOutage[] }
  | { status: 'error'; reason: string };

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Sends one announcement to the model.
 *
 * Returns an 'error' result rather than throwing, so one bad article cannot end
 * a run. run.ts queues those for review — an announcement is never silently
 * dropped, which is the property that makes a single parser safe to rely on.
 */
export async function extractOutages(
  announcement: RawAnnouncement,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractionResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: 'error', reason: 'no OPENAI_API_KEY configured' };

  const user = [
    `Publication date: ${announcement.publishedAt.slice(0, 10)}`,
    '',
    `Title: ${announcement.title}`,
    '',
    'Body:',
    announcement.body.slice(0, MAX_BODY_CHARS),
  ].join('\n');

  let payload: unknown;
  let lastError = '';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    const outcome = await request(fetchImpl, key, user);
    if (outcome.ok) {
      payload = outcome.payload;
      break;
    }
    lastError = outcome.reason;
    if (!outcome.retryable) return { status: 'error', reason: outcome.reason };
  }
  if (payload === undefined) return { status: 'error', reason: lastError };

  const message = (
    payload as { choices?: { message?: { content?: string; refusal?: string | null } }[] }
  ).choices?.[0]?.message;
  // A structured-output refusal arrives in its own field, not as malformed JSON
  // in `content`.
  if (message?.refusal) return { status: 'error', reason: `model refused: ${message.refusal}` };
  if (!message?.content) return { status: 'error', reason: 'empty response' };

  const outages = validate(message.content);
  if (!outages) return { status: 'error', reason: 'response did not match the schema' };
  return { status: 'ok', outages };
}

type RequestOutcome =
  | { ok: true; payload: unknown }
  | { ok: false; reason: string; retryable: boolean };

async function request(fetchImpl: typeof fetch, key: string, user: string): Promise<RequestOutcome> {
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        // Extraction, not writing. Nothing here is improved by sampling.
        temperature: 0,
        max_completion_tokens: 2048,
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      return {
        ok: false,
        reason: `openai ${response.status}: ${detail}`,
        // Rate limiting and the server's own faults pass; a rejected request
        // will be rejected the same way every time.
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    return { ok: true, payload: await response.json() };
  } catch (error) {
    return { ok: false, reason: `openai request failed: ${(error as Error).message}`, retryable: true };
  }
}

/**
 * Structured Outputs makes the shape a guarantee rather than a hope, but the
 * schema cannot say "HH:MM" or "a real day in the calendar" — and this is the
 * boundary between somebody else's service and our database. A field that fails
 * here drops its entry; it never throws.
 */
export function validate(raw: string): ExtractedOutage[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = (payload as { outages?: unknown } | null)?.outages;
  if (!Array.isArray(list)) return null;

  const out: ExtractedOutage[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { kind, date, start, end, areas, cancelled, ongoing } = entry as Record<string, unknown>;
    if (kind !== 'planned' && kind !== 'fault' && kind !== 'rotating') continue;
    if (typeof date !== 'string' || !isCalendarDate(date)) continue;
    if (start !== null && !(typeof start === 'string' && isClock(start))) continue;
    if (end !== null && !(typeof end === 'string' && isClock(end))) continue;
    if (!Array.isArray(areas)) continue;
    const names = areas.filter((a): a is string => typeof a === 'string' && a.trim().length > 1);
    if (names.length === 0) continue;
    out.push({
      kind,
      date,
      start: (start as string | null) ?? null,
      end: (end as string | null) ?? null,
      areas: names,
      cancelled: cancelled === true,
      ongoing: ongoing === true,
    });
  }
  return out;
}

function isClock(value: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

// Not only the shape: '2026-02-31' matches the pattern and is not a day.
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
