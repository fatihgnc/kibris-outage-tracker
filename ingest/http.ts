import { setTimeout as delay } from 'node:timers/promises';

// Fetching etiquette (§10.3). This project is public and takes public data, so
// it behaves accordingly: a descriptive User-Agent with a contact address,
// robots.txt respected, conditional requests, one request per host at a time
// with a short delay, and bounded retries.

const CONTACT = process.env.INGEST_CONTACT ?? 'fathgnc.dev@gmail.com';
export const USER_AGENT = `KesintiMiVarBot/0.1 (+https://github.com/fatihgnc/kibris-outage-tracker; outage tracker for Northern Cyprus; contact: ${CONTACT})`;

const REQUEST_TIMEOUT_MS = 20000;
const HOST_DELAY_MS = 1500;
const MAX_ATTEMPTS = 3;

export type CacheEntry = { etag?: string; lastModified?: string };
export type ConditionalCache = Map<string, CacheEntry>;

export type FetchResult =
  | { status: 'ok'; body: string; url: string }
  | { status: 'unchanged' }
  | { status: 'skipped'; reason: string };

// One request per host at a time: each host gets a promise chain that the next
// request waits on, plus a delay between consecutive requests.
const hostQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(host: string, task: () => Promise<T>): Promise<T> {
  const previous = hostQueues.get(host) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const result = await task();
      await delay(HOST_DELAY_MS);
      return result;
    });
  hostQueues.set(
    host,
    next.catch(() => undefined),
  );
  return next;
}

const robotsCache = new Map<string, Promise<RobotsRules>>();

type RobotsRules = { disallow: string[] };

// Minimal robots.txt reader: the `User-agent: *` group's Disallow list, with
// the `*` wildcard supported. A robots.txt that cannot be fetched is treated
// as permissive, which matches how the standard is normally applied.
async function getRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  const pending = (async (): Promise<RobotsRules> => {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return { disallow: [] };
      return parseRobots(await response.text());
    } catch {
      return { disallow: [] };
    }
  })();
  robotsCache.set(origin, pending);
  return pending;
}

export function parseRobots(text: string): RobotsRules {
  const disallow: string[] = [];
  let inWildcardGroup = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(':');
    const field = rawField.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (field === 'user-agent') {
      inWildcardGroup = value === '*';
      continue;
    }
    if (inWildcardGroup && field === 'disallow' && value) disallow.push(value);
  }
  return { disallow };
}

export function isAllowed(pathname: string, rules: RobotsRules): boolean {
  return !rules.disallow.some((rule) => matchesRule(pathname, rule));
}

function matchesRule(pathname: string, rule: string): boolean {
  const pattern = rule
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\$$/, '$');
  return new RegExp(`^${pattern}`).test(pathname);
}

// Fetches a URL politely. Returns 'unchanged' when the server answers 304 to a
// conditional request, so an unchanged page costs nothing downstream.
export async function politeFetch(url: string, cache: ConditionalCache): Promise<FetchResult> {
  const parsed = new URL(url);
  const robots = await getRobots(parsed.origin);
  if (!isAllowed(parsed.pathname, robots)) {
    return { status: 'skipped', reason: `disallowed by robots.txt: ${parsed.pathname}` };
  }

  return enqueue(parsed.host, async () => {
    const entry = cache.get(url);
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const headers: Record<string, string> = {
          'user-agent': USER_AGENT,
          accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9',
          'accept-language': 'tr,en;q=0.8',
        };
        if (entry?.etag) headers['if-none-match'] = entry.etag;
        if (entry?.lastModified) headers['if-modified-since'] = entry.lastModified;

        const response = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.status === 304) return { status: 'unchanged' } as const;

        if (response.status === 429 || response.status >= 500) {
          throw new Error(`upstream responded ${response.status}`);
        }
        if (!response.ok) {
          return { status: 'skipped', reason: `responded ${response.status}` } as const;
        }

        const etag = response.headers.get('etag');
        const lastModified = response.headers.get('last-modified');
        if (etag || lastModified) {
          cache.set(url, { etag: etag ?? undefined, lastModified: lastModified ?? undefined });
        }
        return { status: 'ok', body: await response.text(), url: response.url } as const;
      } catch (error) {
        lastError = error;
        // Exponential backoff, at most three attempts, then give up until the
        // next run rather than hammering a struggling server.
        if (attempt < MAX_ATTEMPTS) await delay(1000 * 2 ** (attempt - 1));
      }
    }

    return {
      status: 'skipped',
      reason: `failed after ${MAX_ATTEMPTS} attempts: ${errorMessage(lastError)}`,
    } as const;
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
