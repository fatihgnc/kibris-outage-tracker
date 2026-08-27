import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { marked } from 'marked';
import type { Locale } from './i18n/config';
import { GUIDE_SLUGS, type GuideSlug } from './routes';

// Long-form content lives as markdown, one file per document per locale, so no
// prose is ever written inline in a component (§0). Guides are in
// content/guides/, the legal and about pages in content/pages/.
//
//   content/guides/report-a-fault.tr.md
//   content/pages/privacy.en.md

const CONTENT_ROOT = join(process.cwd(), 'content');

export type ContentMeta = {
  slug: string;
  title: string;
  summary: string;
  updated: string; // ISO date, shown as "last reviewed"
};

export type ContentDocument = ContentMeta & { html: string };

// Minimal frontmatter reader: `key: value` lines between --- fences. The files
// are ours, so a full YAML parser would be a dependency for nothing.
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = value;
  }
  return { data, body: match[2] };
}

async function readDocument(kind: 'guides' | 'pages', slug: string, locale: Locale): Promise<ContentDocument | null> {
  let raw: string;
  try {
    raw = await readFile(join(CONTENT_ROOT, kind, `${slug}.${locale}.md`), 'utf8');
  } catch {
    return null;
  }
  const { data, body } = parseFrontmatter(raw);
  return {
    slug,
    title: data.title ?? slug,
    summary: data.summary ?? '',
    updated: data.updated ?? '',
    html: await marked.parse(body, { async: true, gfm: true }),
  };
}

export function getGuide(slug: string, locale: Locale): Promise<ContentDocument | null> {
  return readDocument('guides', slug, locale);
}

export function getPage(slug: string, locale: Locale): Promise<ContentDocument | null> {
  return readDocument('pages', slug, locale);
}

// The launch set (§5.4), in the order the index lists them. Declared rather
// than inferred from the directory so the order is deliberate and a missing
// translation fails loudly instead of silently shortening the list.
//
// It lives in lib/routes.ts, next to the per-locale slug each one is published
// under, and is re-exported here because this is where a guide is read from
// disk. One list, two readers: proxy.ts cannot import this module.
export { GUIDE_SLUGS, isGuideSlug, type GuideSlug } from './routes';

// The slug is narrowed on the way out: the index links to each guide, and a
// link needs the per-locale slug, which is only defined for a known guide.
export async function getGuideIndex(locale: Locale): Promise<(ContentDocument & { slug: GuideSlug })[]> {
  const documents = await Promise.all(
    GUIDE_SLUGS.map(async (slug) => {
      const document = await getGuide(slug, locale);
      return document && { ...document, slug };
    }),
  );
  return documents.filter((document) => document !== null);
}

// Used by the build-time check that every guide exists in both locales.
export async function listGuideFiles(): Promise<string[]> {
  try {
    return await readdir(join(CONTENT_ROOT, 'guides'));
  } catch {
    return [];
  }
}
