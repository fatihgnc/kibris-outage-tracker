import assert from 'node:assert/strict';
import test from 'node:test';
import { pingRevalidate } from './revalidate';

const withEnv = async (env: Record<string, string | undefined>, run: () => Promise<void>) => {
  const before: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    before[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    await run();
  } finally {
    for (const key of Object.keys(env)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
};

const never: typeof fetch = async () => {
  throw new Error('fetch must not be called');
};

// A checkout without the secret — a fork, a local run — must do nothing at
// all, and say so, rather than knock on someone's site.
test('without configuration nothing is called', async () => {
  await withEnv({ REVALIDATE_SECRET: undefined, NEXT_PUBLIC_SITE_URL: 'https://example.com' }, async () => {
    const result = await pingRevalidate(never);
    assert.equal(result.ok, false);
    assert.match(result.skipped ?? '', /REVALIDATE_SECRET/);
  });
  await withEnv({ REVALIDATE_SECRET: 's3cret', NEXT_PUBLIC_SITE_URL: undefined }, async () => {
    const result = await pingRevalidate(never);
    assert.match(result.skipped ?? '', /NEXT_PUBLIC_SITE_URL/);
  });
  await withEnv({ REVALIDATE_SECRET: 's3cret', NEXT_PUBLIC_SITE_URL: 'not a url' }, async () => {
    const result = await pingRevalidate(never);
    assert.match(result.skipped ?? '', /localhost/);
  });
});

test('the secret travels in the header, to the site root', async () => {
  await withEnv({ REVALIDATE_SECRET: 's3cret', NEXT_PUBLIC_SITE_URL: 'kesintimivar.com' }, async () => {
    let seen: { url: string; method?: string; secret: string | null } | null = null;
    const fake: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      seen = { url: String(input), method: init?.method, secret: headers.get('x-revalidate-secret') };
      return new Response('{}', { status: 200 });
    };
    const result = await pingRevalidate(fake);
    assert.deepEqual(seen, {
      url: 'https://kesintimivar.com/api/revalidate',
      method: 'POST',
      secret: 's3cret',
    });
    assert.deepEqual(result, { ok: true, status: 200 });
  });
});

// A run has already stored its outages by the time this is called; a site
// that is down or says no cannot turn that run into a failure.
test('a refusal or a network error is reported, never thrown', async () => {
  await withEnv({ REVALIDATE_SECRET: 'wrong', NEXT_PUBLIC_SITE_URL: 'https://kesintimivar.com' }, async () => {
    const refused: typeof fetch = async () => new Response('unauthorised', { status: 401 });
    assert.deepEqual(await pingRevalidate(refused), { ok: false, status: 401 });
    const down: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    assert.deepEqual(await pingRevalidate(down), { ok: false, status: null, skipped: 'request failed' });
  });
});
