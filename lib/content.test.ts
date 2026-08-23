import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGuide, getGuideIndex, getPage, GUIDE_SLUGS } from './content';
import { locales } from './i18n/config';

// English is a first-class locale, not a courtesy translation (§0), so a guide
// that exists in one language and not the other is a bug, not a gap.
test('every guide exists in both locales with full frontmatter', async () => {
  for (const locale of locales) {
    for (const slug of GUIDE_SLUGS) {
      const guide = await getGuide(slug, locale);
      assert.ok(guide, `missing guide ${slug}.${locale}.md`);
      assert.ok(guide.title.length > 5, `${slug}.${locale}: no title`);
      assert.ok(guide.summary.length > 20, `${slug}.${locale}: no summary`);
      assert.match(guide.updated, /^\d{4}-\d{2}-\d{2}$/, `${slug}.${locale}: bad updated date`);
      assert.ok(guide.html.includes('<h2'), `${slug}.${locale}: no sections`);
    }
  }
});

// Ad networks reject thin content, and these are meant to be real reference
// material rather than filler (§5.4: roughly 600-1,200 words each).
test('every guide is substantial in both locales', async () => {
  for (const locale of locales) {
    for (const slug of GUIDE_SLUGS) {
      const guide = await getGuide(slug, locale);
      const words = guide!.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 500, `${slug}.${locale}: only ${words} words`);
    }
  }
});

test('the guide index lists every guide in order', async () => {
  for (const locale of locales) {
    const index = await getGuideIndex(locale);
    assert.deepEqual(
      index.map((guide) => guide.slug),
      [...GUIDE_SLUGS],
    );
  }
});

// An ad network checks for these before approving a site, and a person
// deserves them regardless (§5.5).
test('about, privacy and terms exist in both locales', async () => {
  for (const locale of locales) {
    for (const slug of ['about', 'privacy', 'terms'] as const) {
      const page = await getPage(slug, locale);
      assert.ok(page, `missing page ${slug}.${locale}.md`);
      assert.ok(page.title.length > 3, `${slug}.${locale}: no title`);
      assert.ok(page.html.length > 1500, `${slug}.${locale}: too thin to be honest`);
    }
  }
});

// The privacy page must describe the cookies the site actually sets, by name.
test('the privacy page names every cookie the site sets', async () => {
  for (const locale of locales) {
    const page = await getPage('privacy', locale);
    for (const cookie of ['locale', 'consent']) {
      assert.ok(page!.html.includes(cookie), `privacy.${locale}: does not mention the ${cookie} cookie`);
    }
  }
});

// The renderer escapes apostrophes, so assertions run against decoded text
// rather than raw HTML.
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

// The site is independent of the utility and must say so plainly (§5.5).
test('the about page states the site is not the utility', async () => {
  const tr = await getPage('about', 'tr');
  const en = await getPage('about', 'en');
  assert.match(textOf(tr!.html), /resmî sitesi değildir/);
  assert.match(textOf(en!.html), /not KIB-TEK's official site/);
  for (const page of [tr, en]) {
    assert.ok(page!.html.includes('fathgnc.dev@gmail.com'), 'about: no working contact address');
  }
});
