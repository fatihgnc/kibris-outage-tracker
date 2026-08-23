import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate } from './fallback';

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
