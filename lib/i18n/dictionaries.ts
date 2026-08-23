import type { Locale } from './config';
import { tr } from './tr';

// The Dictionary type is derived from the Turkish dictionary, so a missing or
// mistyped English key fails the build instead of rendering a blank space.
export type Dictionary = typeof tr;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  if (locale === 'en') {
    return (await import('./en')).en;
  }
  return tr;
}

// Replaces {name} placeholders in a dictionary string. Values are inserted
// verbatim; anything locale-sensitive (dates, numbers, durations) must already
// be formatted through Intl or lib/time.ts before it gets here.
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
