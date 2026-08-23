import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectProvider, validate } from './fallback';

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
