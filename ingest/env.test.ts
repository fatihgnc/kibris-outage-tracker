import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envOr } from './env';

const VAR = 'KKT_ENV_TEST';

test('an unset variable falls back', () => {
  delete process.env[VAR];
  assert.equal(envOr(VAR, 'fallback'), 'fallback');
});

// The one that reached production. GitHub Actions passes an unset repository
// variable through as the empty string, `??` keeps it, and the first run of the
// new parser sent `model: ""` to OpenAI for every announcement.
test('a variable set to the empty string falls back too', () => {
  process.env[VAR] = '';
  assert.equal(envOr(VAR, 'fallback'), 'fallback');
});

test('whitespace is not a value', () => {
  process.env[VAR] = '   ';
  assert.equal(envOr(VAR, 'fallback'), 'fallback');
});

test('a real value wins, trimmed', () => {
  process.env[VAR] = ' gpt-4o-mini\n';
  assert.equal(envOr(VAR, 'fallback'), 'gpt-4o-mini');
  delete process.env[VAR];
});
