import type { OutageKind, OutageScope } from '../../lib/types';
import type { RawAnnouncement } from './index';
import { envOr } from '../env';
import { nicosiaWallClock } from '../../lib/time';

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

// `||`, not `??`. A workflow that passes an unset repository variable through
// to the environment sets it to the empty string, which is not nullish — the
// first production run sent `model: ""` and OpenAI answered "you must provide a
// model parameter" for every announcement. Both went to the review queue and
// the job stayed green, because a failed reading is a supported outcome.
//
// An env var that is present but empty is the normal case for CI, not an edge
// one, and the same reasoning applies to every override read this way.
const MODEL = envOr('LLM_MODEL', 'gpt-4o-mini');
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
          required: [
            'kind',
            'date',
            'weekday',
            'start',
            'end',
            'areas',
            'scope',
            'cancelled',
            'ongoing',
            'continuation',
            'resolved',
            'restoredAt',
          ],
          properties: {
            kind: { type: 'string', enum: ['planned', 'fault', 'rotating'] },
            date: {
              type: 'string',
              description:
                'YYYY-MM-DD, the local date the outage STARTS, resolved against the publication date given to you. For a window running past midnight — "bugun saat 23.00 ile yarin saat 02.00 arasinda" — this is the EARLIER day, the one "start" falls on, not the day it ends.',
            },
            weekday: {
              type: ['string', 'null'],
              enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', null],
              description:
                'The weekday the announcement names for the outage, in English, if it names one — "perşembe günü" is thursday. Report it whenever the announcement says one, including where it also gives a date ("27 Ağustos Perşembe günü" is both). null only when no weekday is named at all. Report what it says; the day is worked out from this and the date together.',
            },
            start: {
              type: ['string', 'null'],
              description:
                'HH:MM, 24-hour local: when the outage BEGAN. null only when the announcement states no start time at all, which happens for a fault already in progress. Never the time the power came back — that is "restoredAt", and putting it here turns a repair report into an outage starting the moment it ended.',
            },
            end: {
              type: ['string', 'null'],
              description:
                'HH:MM, 24-hour local. null when no end time is announced, which is typical for faults.',
            },
            areas: {
              type: 'array',
              description:
                'Settlement, village or neighbourhood names exactly as the announcement writes them, in Turkish. Do not translate or transliterate. Leave out anything that is not a settlement: businesses and buildings named as landmarks, and roads, junctions and directions. \"Lefkoşa–Girne ana yolu Boğaz Kavşağı\" is where the work is, not somewhere that loses power — it names three places in two districts and the outage is in none of them. Give the settlement instead. When "scope" is "district", put the district\'s own name here and nothing else.',
              items: { type: 'string' },
            },
            scope: {
              type: 'string',
              enum: ['places', 'district'],
              description:
                'Answer this one by finding the sentence that says who is without power, and looking at what that sentence names. If it names a district or region — "Guzelyurt ve Lefke bolgelerine elektrik verilemiyor", "Lefke bolgesinde elektrik kesintisi", "Girne genelinde elektrik kesintisi yasaniyor" — answer "district", and put those district names in "areas". If it names settlements, villages or neighbourhoods, answer "places" and put those in "areas". Ignore every other place the article mentions when deciding: a village named as where the damage is, or where a transformer or a line runs, is not the extent. In "Gunesskoy-Cengizkoy trafo merkezleri arasindaki hatta direkler devrildi; Guzelyurt ve Lefke bolgelerine elektrik verilemiyor" the sentence about power names Guzelyurt and Lefke as regions, so the answer is "district" even though two villages appear earlier. Lefkosa, Girne, Gazimagusa, Guzelyurt, Iskele and Lefke are each a town as well as a district, so the same name can go either way: it is "district" only where that sentence treats it as the region. If no sentence states an extent at all, answer "places".',
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
            resolved: {
              type: 'boolean',
              description:
                'true when this article reports that the fault has been REPAIRED and the power is back — "arıza giderildi", "elektrikler yeniden verildi", "normale döndü". Not the same as an article about works that are still going on: "arızanın giderilmesi için çalışmalar devam ediyor" is still an outage, not a repair.',
            },
            continuation: {
              type: 'boolean',
              description:
                'true when the announcement reports an outage that was already running before this article was written — it refers back rather than announcing something new: "dün başlayan arıza", "24 saati aşkın süredir elektrik verilemiyor", "önceki gün meydana gelen". false for an announcement of an outage that starts today or later, and false for the first article to report a fault. Being about a fault that is still not fixed is not enough on its own: the first report of a fault in progress is also still running, and it is not a continuation.',
            },
            restoredAt: {
              type: ['string', 'null'],
              description:
                'HH:MM, 24-hour local: the time the article says the power CAME BACK — "saat 18.30 itibarıyla ... elektrik verildi". null unless it names one. A repair article usually carries two clocks, one for when the fault happened and one for when it was over; this is the later of the two.',
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
  '- Return an empty list when the article is not about an electricity outage at all.',
  '- An article reporting that a fault has been FIXED is not nothing: return the outage it is about, with "resolved" true and the places it names, so the record can be closed. Leave "start" null unless the article says when it began.',
  '- One entry per distinct outage. An announcement listing many villages under one time window is ONE outage with many areas, not one per village.',
  '- Resolve "bugün" and "yarın" against the publication date you are given. "bugün" IS the publication date.',
  '- When the announcement names a WEEKDAY ("perşembe günü"), put it in "weekday" and do not try to work the date out — resolving a weekday is a subtraction that is done afterwards, not by you. Fill "date" as well, with what the announcement says if it gives one and your best effort otherwise: a date that already falls on the named weekday is taken as read, and one that does not is replaced by counting from the publication date.',
  '- "date" is the day the outage STARTS. An announcement reading "bugün saat 23.00 ile yarın saat 02.00 arasında" starts today at 23:00 and ends tomorrow at 02:00: date is the publication date, start is 23:00, end is 02:00. Do not move the date forward because the window crosses midnight.',
  '- "continuation" separates an article reporting an outage that was already under way from one announcing a new one. "Lefke\'nin 24 saati aşkın süredir elektriksiz olduğunu belirtti" is a continuation: the outage began before this article was written. The first report of the same fault, written on the day it happened, is not — a fault still running is not by itself a continuation. Neither is a planned outage announced for tomorrow.',
  '- Never invent a time. When a fault is already in progress and no start is stated, set "start" to null and "ongoing" to true.',
  '- A repair article carries two clocks and they must not be swapped: "bugun saat 16.00 siralarinda meydana gelen ariza" is "start", "saat 18.30 itibariyla elektrik verildi" is "restoredAt". The time the power returned is never a start time.',
  '- Planned work states its hours almost without exception. If a clearly scheduled outage gives no hours, return what you can find and leave the rest null rather than estimating.',
  '- \"areas\" must be the place names the announcement itself uses. Include villages, towns and neighbourhoods. Leave out anything that is not a settlement: businesses and buildings used as landmarks, and roads, junctions and directions. A road name carries the settlements it runs between and they are not the ones losing power — in "09.30 ile 12.30 arasında Boğazköy köy içi, Lefkoşa–Girne ana yolu Boğaz Kavşağı bölgelerine elektrik verilemeyecek" the answer is Boğazköy.',
  '- "scope" says how wide the outage is, and it is a question about what loses power, not about which words the article happens to contain. "places" means the announcement lists the settlements, villages or neighbourhoods that go dark, and those are what "areas" holds. "district" means it states the extent as a district or region: "Lefke bölgesinde elektrik kesintisi", "Güzelyurt ve Lefke bölgelerine elektrik verilemiyor", "Girne genelinde elektrik kesintisi yaşanacaktır" — and then "areas" holds the district names.',
  '- A place named as the CAUSE of the outage does not make it "places". "Güneşköy-Cengizköy trafo merkezleri arasındaki yüksek gerilim hattında direkler devrildi; Güzelyurt ve Lefke bölgelerine elektrik verilemiyor" is "district": the damage is at Güneşköy and Cengizköy, the extent is the two districts, and "areas" is Güzelyurt and Lefke. Ask what the announcement says is without power, not which names it mentions.',
  '- Lefkoşa, Girne, Gazimağusa, Güzelyurt, İskele and Lefke are each a town as well as the district around it, and this is the mistake to avoid in the other direction. An announcement about the town is "places": "Lefke\'de bir trafo arızası nedeniyle elektrik kesintisi" is the town of Lefke. An announcement naming a district only to locate a village inside it is also "places": "Lefke\'nin Cengizköy mevkiinde" is about Cengizköy, and Cengizköy is what goes in "areas".',
  '- Where the announcement states no extent at all and only names places, answer "places".',
].join('\n');

export type ExtractedOutage = {
  kind: OutageKind;
  resolved: boolean;
  /** HH:MM local, when the announcement says the power came back. */
  restoredAt: string | null;
  date: string;
  weekday: Weekday | null;
  start: string | null;
  end: string | null;
  areas: string[];
  scope: OutageScope;
  cancelled: boolean;
  ongoing: boolean;
  continuation: boolean;
};

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type ExtractionResult =
  | { status: 'ok'; outages: ExtractedOutage[] }
  | { status: 'error'; reason: string };

/**
 * The key, or null — where "set to whitespace" counts as not set.
 *
 * `envOr` already treats an empty or blank override as absent, and its own
 * comment says the same reasoning applies to every value read from the
 * environment. The key was the one read straight off `process.env`, and it is
 * the value that can fail most quietly: a secret pasted with a trailing newline
 * is truthy, so run.ts prints no warning, every request goes out with a broken
 * Authorization header, and the 401 is classified non-retryable — so every
 * announcement in every run lands in the review queue while the job stays green.
 * That is the exact shape env.ts was written to describe.
 */
function apiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

export function hasApiKey(): boolean {
  return apiKey() !== null;
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
  const key = apiKey();
  if (!key) return { status: 'error', reason: 'no OPENAI_API_KEY configured' };

  // The weekday is given rather than left to be worked out. Announcements say
  // "perşembe günü" constantly, and asked to resolve one against a bare date the
  // model answered Tuesday for a Thursday, five times out of five. Calendar
  // arithmetic is not what it is good at and not what it is here for; naming the
  // day turns the question into counting forward from a known one.
  // Nicosia's calendar day, not UTC's — the same day `dateOfNext` counts from in
  // parse/index.ts. They used to differ: this sliced the ISO string, which is
  // UTC, so for anything published between 21:00Z and midnight the model was
  // told one date and our own weekday arithmetic used the next. An announcement
  // saying "bugün" and one saying "pazartesi günü" then landed on different days
  // from the same article.
  const local = nicosiaWallClock(Date.parse(announcement.publishedAt));
  const published = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  const weekday = new Date(`${published}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  const user = [
    `Publication date: ${published} (a ${weekday})`,
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
    const {
      kind,
      date,
      weekday,
      start,
      end,
      areas,
      scope,
      cancelled,
      ongoing,
      continuation,
      resolved,
      restoredAt,
    } = entry as Record<string, unknown>;
    if (kind !== 'planned' && kind !== 'fault' && kind !== 'rotating') continue;
    if (typeof date !== 'string' || !isCalendarDate(date)) continue;
    if (weekday !== null && !WEEKDAYS.includes(weekday as Weekday)) continue;
    if (start !== null && !(typeof start === 'string' && isClock(start))) continue;
    if (end !== null && !(typeof end === 'string' && isClock(end))) continue;
    // A malformed restoration clock loses only itself: the publication time
    // still bounds the repair, so the entry is worth keeping without it.
    const restored = typeof restoredAt === 'string' && isClock(restoredAt) ? restoredAt : null;
    if (!Array.isArray(areas)) continue;
    const names = areas.filter((a): a is string => typeof a === 'string' && a.trim().length > 1);
    if (names.length === 0) continue;
    // A scope that comes back unreadable degrades to the narrow reading rather
    // than dropping the entry. 'places' is what every record meant before this
    // field existed, so the cost is a map no wider than it already was, and
    // losing a whole announcement over a widening hint is the worse trade.
    // `kind` above drops because it has no safe fallback; this one has one.
    const reading: OutageScope = scope === 'district' ? 'district' : 'places';
    out.push({
      kind,
      date,
      weekday: (weekday as Weekday | null) ?? null,
      start: (start as string | null) ?? null,
      end: (end as string | null) ?? null,
      areas: names,
      scope: reading,
      cancelled: cancelled === true,
      ongoing: ongoing === true,
      continuation: continuation === true,
      resolved: resolved === true,
      restoredAt: restored,
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
