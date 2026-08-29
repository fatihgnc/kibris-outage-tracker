import assert from 'node:assert/strict';
import test from 'node:test';
import { guideHref, internalPath, localizedPath, parsePath, routeHref } from './routes';

// proxy.ts reads every request through parsePath. A section it does not
// recognise is left alone — which for a section that has a page means the
// rewrite never happens and the reader gets a 404.
test('the sections that take a child are recognised with one', () => {
  assert.deepEqual(parsePath('/tr/bolge/lefkosa'), { locale: 'tr', key: 'district', sub: 'lefkosa' });
  assert.deepEqual(parsePath('/tr/kesinti/2026-08-26-guzelyurt-yuvacik-a3f19c2b'), {
    locale: 'tr',
    key: 'outage',
    sub: '2026-08-26-guzelyurt-yuvacik-a3f19c2b',
  });
  assert.deepEqual(parsePath('/en/place/gonyeli'), { locale: 'en', key: 'place', sub: 'gonyeli' });
});

test('a section that takes no child rejects one', () => {
  assert.equal(parsePath('/tr/gizlilik/bir-sey'), null);
  assert.equal(parsePath('/tr/arsiv/lefkosa'), null);
});

test('the new sections are translated in both directions', () => {
  assert.equal(routeHref('tr', 'outage', 'x-a3f19c2b'), '/tr/kesinti/x-a3f19c2b');
  assert.equal(routeHref('en', 'outage', 'x-a3f19c2b'), '/en/outage/x-a3f19c2b');
  assert.equal(routeHref('tr', 'place', 'gonyeli'), '/tr/yer/gonyeli');
  assert.equal(routeHref('en', 'place', 'gonyeli'), '/en/place/gonyeli');
});

// The child of these sections is locale-neutral, so switching language keeps
// it verbatim — unlike a guide, whose slug is itself translated.
test('switching locale keeps a locale-neutral child but translates a guide slug', () => {
  const outage = parsePath('/tr/kesinti/2026-08-26-guzelyurt-yuvacik-a3f19c2b');
  assert.ok(outage);
  assert.equal(localizedPath(outage, 'en'), '/en/outage/2026-08-26-guzelyurt-yuvacik-a3f19c2b');

  const place = parsePath('/en/place/gonyeli');
  assert.ok(place);
  assert.equal(localizedPath(place, 'tr'), '/tr/yer/gonyeli');

  const guide = parsePath('/tr/rehberler/kesinti-turleri');
  assert.ok(guide);
  assert.equal(localizedPath(guide, 'en'), guideHref('en', 'outage-types'));
});

// A path spelled in the other locale's words is recognised well enough to be
// redirected — that is what gives each page exactly one indexable address.
test('a path spelled in the wrong locale resolves to its canonical one', () => {
  const wrong = parsePath('/tr/outage/x-a3f19c2b');
  assert.ok(wrong);
  assert.equal(localizedPath(wrong, wrong.locale), '/tr/kesinti/x-a3f19c2b');
});

// The folders under app/[locale] keep English names; only the address is Turkish.
test('the internal path is the English folder name', () => {
  const parsed = parsePath('/tr/yer/gonyeli');
  assert.ok(parsed);
  assert.equal(internalPath(parsed), '/tr/place/gonyeli');
});
