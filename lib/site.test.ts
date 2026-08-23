import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSiteUrl } from './site';

// A bad value here used to throw inside generateMetadata, which returned a 500
// for every page on the site.
test('accepts a bare hostname, the common dashboard paste', () => {
  assert.equal(resolveSiteUrl('kibris-outage-tracker.vercel.app').href, 'https://kibris-outage-tracker.vercel.app/');
});

test('keeps an explicit protocol', () => {
  assert.equal(resolveSiteUrl('https://sonenada.com').href, 'https://sonenada.com/');
  assert.equal(resolveSiteUrl('http://localhost:3000').href, 'http://localhost:3000/');
});

test('tolerates whitespace and a trailing slash', () => {
  assert.equal(resolveSiteUrl('  sonenada.com/  ').href, 'https://sonenada.com/');
});

test('falls back when unset or empty', () => {
  assert.equal(resolveSiteUrl(undefined).href, 'http://localhost:3000/');
  assert.equal(resolveSiteUrl('   ').href, 'http://localhost:3000/');
});

test('falls back instead of throwing on an unusable value', () => {
  assert.doesNotThrow(() => resolveSiteUrl('http://'));
  assert.equal(resolveSiteUrl('http://').href, 'http://localhost:3000/');
});
