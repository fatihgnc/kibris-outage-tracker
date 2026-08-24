import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { RawAnnouncement } from './index';
import { runFallback, selectProvider, validate } from './fallback';

// The fallback's output is never trusted on shape: it is validated against the
// expected schema before any of it is accepted (§10.4).
test('accepts a well-formed response', () => {
  const parsed = validate(
    '{"outages":[{"kind":"planned","date":"2026-08-23","start":"09:00","end":"15:00","areas":["Gönyeli","Alayköy"]}]}',
  );
  assert.deepEqual(parsed, [
    { kind: 'planned', date: '2026-08-23', start: '09:00', end: '15:00', areas: ['Gönyeli', 'Alayköy'] },
  ]);
});

test('accepts a null end, which is normal for a fault', () => {
  const parsed = validate('{"outages":[{"kind":"fault","date":"2026-08-23","start":"14:00","end":null,"areas":["Lapta"]}]}');
  assert.equal(parsed?.length, 1);
  assert.equal(parsed![0].end, null);
});

test('tolerates a fenced code block around the JSON', () => {
  const parsed = validate('```json\n{"outages":[{"kind":"rotating","date":"2026-08-23","start":"10:00","end":"12:00","areas":["Lefke"]}]}\n```');
  assert.equal(parsed?.length, 1);
});

test('rejects prose, malformed JSON, and the wrong root shape', () => {
  assert.equal(validate('I could not find a time range in this announcement.'), null);
  assert.equal(validate('{"outages":['), null);
  assert.equal(validate('{"records":[]}'), null);
  assert.equal(validate('[]'), null);
});

test('drops entries with an invalid kind, date, or clock', () => {
  assert.deepEqual(validate('{"outages":[{"kind":"maintenance","date":"2026-08-23","start":"09:00","end":null,"areas":["Girne"]}]}'), []);
  assert.deepEqual(validate('{"outages":[{"kind":"planned","date":"23/08/2026","start":"09:00","end":null,"areas":["Girne"]}]}'), []);
  assert.deepEqual(validate('{"outages":[{"kind":"planned","date":"2026-08-23","start":"25:00","end":null,"areas":["Girne"]}]}'), []);
  assert.deepEqual(validate('{"outages":[{"kind":"planned","date":"2026-08-23","start":"09:70","end":null,"areas":["Girne"]}]}'), []);
});

test('drops entries with no usable place names', () => {
  assert.deepEqual(validate('{"outages":[{"kind":"planned","date":"2026-08-23","start":"09:00","end":null,"areas":[]}]}'), []);
  assert.deepEqual(validate('{"outages":[{"kind":"planned","date":"2026-08-23","start":"09:00","end":null,"areas":[1,2]}]}'), []);
});

test('an empty result is a valid answer, not a failure to parse', () => {
  assert.deepEqual(validate('{"outages":[]}'), []);
});

test('keeps the valid entries and drops the invalid ones in a mixed response', () => {
  const parsed = validate(
    '{"outages":[{"kind":"planned","date":"2026-08-23","start":"09:00","end":"15:00","areas":["Girne"]},{"kind":"nope","date":"x","start":"y","end":null,"areas":[]}]}',
  );
  assert.equal(parsed?.length, 1);
  assert.equal(parsed![0].areas[0], 'Girne');
});

// Stage 2 runs on whichever provider is configured. Only the request shape
// differs; everything validate() does afterwards is identical either way.
// process.env coerces an assigned undefined to the string "undefined", which
// is truthy — so an unset key has to be deleted, not assigned.
function withEnv(env: Record<string, string | undefined>, run: () => void): void {
  const saved = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  const apply = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  for (const [key, value] of Object.entries(env)) apply(key, value);
  try {
    run();
  } finally {
    for (const [key, value] of saved) apply(key, value);
  }
}

test('no key configured means Stage 2 is skipped, not failed', () => {
  withEnv({ OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined }, () => {
    assert.equal(selectProvider('sys', 'user'), null);
  });
});

test('an OpenAI key builds a chat-completions request in JSON mode', () => {
  withEnv({ OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: undefined }, () => {
    const provider = selectProvider('sys', 'user')!;
    assert.equal(provider.name, 'openai');
    assert.match(provider.url, /api\.openai\.com/);
    assert.equal(provider.headers.authorization, 'Bearer sk-test');
    const body = provider.body as Record<string, unknown>;
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.deepEqual(body.messages, [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ]);
  });
});

test('an Anthropic key builds a messages request with a top-level system', () => {
  withEnv({ OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
    const provider = selectProvider('sys', 'user')!;
    assert.equal(provider.name, 'anthropic');
    assert.match(provider.url, /api\.anthropic\.com/);
    assert.equal(provider.headers['x-api-key'], 'sk-ant-test');
    const body = provider.body as Record<string, unknown>;
    assert.equal(body.system, 'sys');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'user' }]);
  });
});

test('OpenAI wins when both keys are present', () => {
  withEnv({ OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
    assert.equal(selectProvider('sys', 'user')!.name, 'openai');
  });
});

// Each provider puts the answer in a different place; both must reach validate.
test('each provider extracts the model text from its own response shape', () => {
  const json = '{"outages":[]}';
  withEnv({ OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: undefined }, () => {
    const provider = selectProvider('s', 'u')!;
    assert.equal(provider.extract({ choices: [{ message: { content: json } }] }), json);
    assert.equal(provider.extract({}), '');
  });
  withEnv({ OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
    const provider = selectProvider('s', 'u')!;
    assert.equal(provider.extract({ content: [{ type: 'text', text: json }] }), json);
    assert.equal(provider.extract({ content: [{ type: 'thinking' }] }), '');
  });
});

// --- Stage 2 end to end -----------------------------------------------------
//
// validate() checks the shape. These check the thing the shape cannot: that
// nothing the model asserts is taken on trust. A model is perfectly capable of
// returning a confident, well-formed answer about a village that does not
// exist, or of putting a real village in the wrong district.

const ANNOUNCEMENT: RawAnnouncement = {
  source: { name: 'Detay Kıbrıs', url: 'https://example.invalid/a', kind: 'press' },
  title: 'Elektrik kesintisi',
  body: 'Bir duyuru metni.',
  publishedAt: '2026-08-23T06:00:00.000Z',
  fetchedAt: '2026-08-23T06:05:00.000Z',
};

const realFetch = globalThis.fetch;
function answerWith(body: unknown, ok = true, status = 200) {
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = (async () =>
    ({ ok, status, json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }) }) as Response) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.OPENAI_API_KEY;
});

test('a village the model invented produces no record at all', async () => {
  answerWith({ outages: [{ kind: 'planned', date: '2026-08-23', start: '09:00', end: '11:00', areas: ['Yeşilvadi Ovası'] }] });
  assert.equal(await runFallback(ANNOUNCEMENT), null, 'an unmatched place must not become an outage');
});

test('the district comes from places.json, not from the model', async () => {
  answerWith({ outages: [{ kind: 'planned', date: '2026-08-23', start: '09:00', end: '11:00', areas: ['Lapta'] }] });
  const result = await runFallback(ANNOUNCEMENT);
  assert.equal(result?.records.length, 1);
  assert.equal(result!.records[0].district, 'girne', 'Lapta is in Girne whatever the model says');
  assert.deepEqual(result!.records[0].areas, ['Lapta']);
});

test('everything Stage 2 produces is marked low confidence', async () => {
  answerWith({ outages: [{ kind: 'fault', date: '2026-08-23', start: '14:00', end: null, areas: ['Lapta'] }] });
  const result = await runFallback(ANNOUNCEMENT);
  assert.equal(result?.records[0].confidence, 'low');
  assert.equal(result?.records[0].endsAt, null, 'an open-ended fault stays open-ended');
  assert.deepEqual(result?.records[0].sources, [ANNOUNCEMENT.source]);
});

test('places in two districts become one record each', async () => {
  answerWith({ outages: [{ kind: 'planned', date: '2026-08-23', start: '09:00', end: '11:00', areas: ['Lapta', 'Gönyeli'] }] });
  const result = await runFallback(ANNOUNCEMENT);
  assert.deepEqual(result?.records.map((r) => r.district).sort(), ['girne', 'lefkosa']);
});

test('a refused or failed request is skipped, not thrown', async () => {
  answerWith({ outages: [] }, false, 429);
  assert.equal(await runFallback(ANNOUNCEMENT), null);

  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
  assert.equal(await runFallback(ANNOUNCEMENT), null, 'a network failure must not stop the run');
});

test('an unparseable answer is skipped, so the announcement still reaches review', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = (async () =>
    ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Sorry, I cannot help.' } }] }) }) as Response) as typeof fetch;
  assert.equal(await runFallback(ANNOUNCEMENT), null);
});

