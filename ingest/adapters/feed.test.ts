import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractArticle } from './feed';

const body = '<p>Kıbrıs Türk Elektrik Kurumu, çalışma nedeniyle elektrik verilemeyeceğini duyurdu.</p>';

// yeniduzen.com opens every article with a bare section banner in its own <h1>
// and puts the headline in the next one. Reading the first left seven items in
// the review queue titled 'HABERLER', throwing away the line where these
// announcements name the day and the place.
test('the headline is the h1 the page itself claims, not merely the first', () => {
  const html = `
    <html><head><title>Yuvacık ve çevresinde bugün elektrik kesintisi</title></head>
    <body><h1>HABERLER</h1><h1 class="content-title">Yuvacık ve çevresinde bugün elektrik kesintisi</h1>
    ${body}</body></html>`;
  assert.equal(extractArticle(html).title, 'Yuvacık ve çevresinde bugün elektrik kesintisi');
});

// kibrisgazetesi.com appends its own name in <title> while the <h1> is clean,
// which is why the declared title picks between the headings rather than
// becoming the headline itself.
test('a site name in the title does not reach the headline', () => {
  const html = `
    <html><head><title>Lefkoşa'da bazı bölgeler üç saat elektriksiz kalacak! - Kıbrıs Gazetesi</title></head>
    <body><h1>Lefkoşa'da bazı bölgeler üç saat elektriksiz kalacak!</h1>${body}</body></html>`;
  assert.equal(extractArticle(html).title, "Lefkoşa'da bazı bölgeler üç saat elektriksiz kalacak!");
});

test('og:title picks the heading when there is no usable title tag', () => {
  const html = `
    <html><head><meta property="og:title" content="Boğazköy ve çevresinde elektrik kesintisi" /></head>
    <body><h1>HABERLER</h1><h1>Boğazköy ve çevresinde elektrik kesintisi</h1>${body}</body></html>`;
  assert.equal(extractArticle(html).title, 'Boğazköy ve çevresinde elektrik kesintisi');
});

test('the title tag stands in when the page has no h1 at all', () => {
  const html = `<html><head><title>Değirmenlik bölgesinde elektrik kesintisi</title></head><body>${body}</body></html>`;
  assert.equal(extractArticle(html).title, 'Değirmenlik bölgesinde elektrik kesintisi');
});

// Nothing to go on is not a reason to return nothing: the first heading is
// still the better guess than an empty title.
test('the first heading stands when nothing agrees with it', () => {
  const html = `<html><head><title>Bambaşka bir şey</title></head><body><h1>HABERLER</h1><h1>İkinci başlık</h1>${body}</body></html>`;
  assert.equal(extractArticle(html).title, 'HABERLER');
});
