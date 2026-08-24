import assert from 'node:assert/strict';
import { test } from 'node:test';
import { articleDate } from './outlet';

test('reads the OpenGraph publication time', () => {
  const html = '<meta property="article:published_time" content="2026-08-20T09:38:00+03:00" />';
  assert.equal(articleDate(html), '2026-08-20T06:38:00.000Z');
});

// Detay Kıbrıs carries the date as microdata on a <div>, with content= before
// the key. A stricter reader found nothing here and the fetch time stood in.
test('reads a microdata itemprop whatever the attribute order', () => {
  const html = '<div content="2026-08-20T09:38:00+03:00" itemprop="datePublished">20.08.2026</div>';
  assert.equal(articleDate(html), '2026-08-20T06:38:00.000Z');
});

test('reads a JSON-LD datePublished', () => {
  const html = '<script type="application/ld+json">{"datePublished": "2026-08-20T09:38:00+03:00"}</script>';
  assert.equal(articleDate(html), '2026-08-20T06:38:00.000Z');
});

test('falls back to Dublin Core, then to <time>', () => {
  const dc = '<meta name="DC.date.issued" content="2026-08-20T09:39:00+03:00" />';
  assert.equal(articleDate(dc), '2026-08-20T06:39:00.000Z');
  assert.equal(articleDate('<time datetime="2026-08-20T09:39:00+03:00">dün</time>'), '2026-08-20T06:39:00.000Z');
});

test('prefers the publication date over a later modification date', () => {
  const html =
    '<meta itemprop="dateModified" content="2026-08-22T11:00:00+03:00" />' +
    '<meta itemprop="datePublished" content="2026-08-20T09:38:00+03:00" />';
  assert.equal(articleDate(html), '2026-08-20T06:38:00.000Z');
});

test('ignores unparseable and absent dates', () => {
  assert.equal(articleDate('<meta name="datePublished" content="yakında" />'), null);
  assert.equal(articleDate('<p>hiçbir tarih yok</p>'), null);
});
