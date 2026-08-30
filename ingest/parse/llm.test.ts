import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractOutages, hasApiKey } from './llm';

// The model is told the publication date and its weekday, and everything it
// resolves — "bugün", "yarın", "perşembe günü" — is counted from that. What it
// is told therefore has to be the same day parse/index.ts counts from, and for a
// while it was not.
function capture(): { fetch: typeof fetch; sent: () => string } {
  let body = '';
  const impl = (async (_url: string, init: { body: string }) => {
    body = init.body;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"outages":[]}' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetch: impl, sent: () => body };
}

const announcement = (publishedAt: string) => ({
  source: { name: 'Kıbrıs Postası', url: 'https://example.invalid/a', kind: 'press' as const },
  title: 'Elektrik kesintisi',
  body: 'Gönyeli bölgesinde elektrik kesintisi yapılacaktır.',
  publishedAt,
  fetchedAt: publishedAt,
});

test.before(() => {
  process.env.OPENAI_API_KEY = 'test-key';
});

test('a key that is only whitespace counts as no key', () => {
  const original = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = ' \n ';
    assert.equal(hasApiKey(), false);
    process.env.OPENAI_API_KEY = '  sk-real  ';
    assert.equal(hasApiKey(), true);
  } finally {
    process.env.OPENAI_API_KEY = original;
  }
});

test('the publication date given to the model is the island’s day', async () => {
  const { fetch: impl, sent } = capture();
  // 22:00Z on 23 August is 01:00 on the 24th in Nicosia. Slicing the ISO string
  // said the 23rd — a Sunday — while dateOfNext in parse/index.ts counted from
  // Monday the 24th, so one article resolved "bugün" and "pazartesi günü" to
  // different days.
  await extractOutages(announcement('2026-08-23T22:00:00.000Z'), impl);
  const user = JSON.parse(sent()).messages[1].content as string;
  assert.match(user, /^Publication date: 2026-08-24 \(a Monday\)/);
});

test('an ordinary daytime publication is unaffected', async () => {
  const { fetch: impl, sent } = capture();
  await extractOutages(announcement('2026-08-23T09:00:00.000Z'), impl);
  const user = JSON.parse(sent()).messages[1].content as string;
  assert.match(user, /^Publication date: 2026-08-23 \(a Sunday\)/);
});
