import { collapseWhitespace, htmlToText } from '../parse/text';

export type FeedItem = {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null; // ISO 8601
};

// Minimal RSS/Atom reader. The feeds here are small and well-formed, and a
// dependency-free reader keeps the ingest easy to run by hand.
export function parseFeed(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  return blocks
    .map((block) => ({
      title: htmlToText(pick(block, 'title') ?? ''),
      link: pickLink(block),
      // Only the summary is read; article text is never stored (§10.3).
      description: htmlToText(pick(block, 'description') ?? pick(block, 'summary') ?? ''),
      publishedAt: parseDateish(
        pick(block, 'pubDate') ?? pick(block, 'published') ?? pick(block, 'updated') ?? pick(block, 'dc:date'),
      ),
    }))
    .filter((item) => item.title || item.description);
}

function pick(block: string, tag: string): string | null {
  const escaped = tag.replace(/[:]/g, '\\:');
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)</${escaped}>`, 'i').exec(block);
  if (!match) return null;
  return unwrapCdata(match[1]).trim();
}

function pickLink(block: string): string {
  const plain = pick(block, 'link');
  if (plain && /^https?:/i.test(plain)) return plain;
  const href = /<link\b[^>]*href=["']([^"']+)["']/i.exec(block);
  if (href) return href[1];
  const guid = pick(block, 'guid');
  return guid && /^https?:/i.test(guid) ? guid : '';
}

function unwrapCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function parseDateish(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// Extracts article links from a tag/category listing page, resolved absolute
// and de-duplicated, for the outlets that publish no usable feed.
export function extractArticleLinks(html: string, baseUrl: string, pattern: RegExp): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let href = match[1];
    if (href.startsWith('//')) href = `https:${href}`;
    let absolute: URL;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (absolute.origin !== new URL(baseUrl).origin) continue;
    if (!pattern.test(absolute.pathname)) continue;
    absolute.hash = '';
    links.add(absolute.toString());
  }
  return [...links];
}

// Pulls the headline and the visible article text out of a news page. Used
// only to extract structured facts; the prose itself is never stored.
export function extractArticle(html: string): { title: string; body: string } {
  const withoutChrome = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const title = headline(withoutChrome, html);
  const paragraphs = [...withoutChrome.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => htmlToText(match[1]))
    .filter((text) => text.length > 25);

  // The lead sentence is where these outlets put the time range, and it is
  // routinely not a <p>: detaykibris keeps it in <div itemprop="description">,
  // others only in a meta description. Missing it meant losing the one fact
  // the parser most needs, so the summary is collected and put first.
  const summary = extractSummary(withoutChrome, html);
  const body =
    summary && !paragraphs.some((text) => text.includes(summary.slice(0, 40)))
      ? [summary, ...paragraphs].join('\n')
      : paragraphs.join('\n');

  return { title, body };
}

// A page can carry more than one <h1>: yeniduzen opens the article with a bare
// <h1>HABERLER</h1> section banner and puts the headline in the one after it.
// Taking the first cost seven of the thirty items sitting in the review queue
// their headline, and the headline is where these announcements name the day
// and the place — the facts the parser most needs, and the ones it now reads
// first, since the earliest date signal in `title. body` is the one that wins.
//
// The page names its own headline in <title> and og:title. Neither is used as
// the headline directly, because some outlets append the site name there
// ('... - Kıbrıs Gazetesi') while the <h1> is clean; they are used to pick
// which <h1> is the article's.
function headline(withoutChrome: string, html: string): string {
  const h1s = [...withoutChrome.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => collapseWhitespace(htmlToText(match[1])))
    .filter((text) => text.length > 0);
  const declared = collapseWhitespace(
    htmlToText(
      /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
        /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
        '',
    ),
  );

  if (h1s.length > 1 && declared) {
    const stated = h1s.find((text) => declared.startsWith(text) || text.startsWith(declared));
    if (stated) return stated;
  }
  return h1s[0] ?? declared;
}

function extractSummary(withoutChrome: string, html: string): string {
  const blocks: RegExp[] = [
    /<[a-z]+\b[^>]*itemprop=["']description["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
    /<[a-z]+\b[^>]*class=["'][^"']*(?:short_content|spot|ozet|summary|excerpt)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
  ];
  for (const pattern of blocks) {
    const match = pattern.exec(withoutChrome);
    if (!match) continue;
    const text = htmlToText(match[1]);
    if (text.length > 25) return text;
  }
  const meta =
    /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const text = meta ? htmlToText(meta[1]) : '';
  return text.length > 25 ? text : '';
}
