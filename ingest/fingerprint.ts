import { createHash } from 'node:crypto';
import { foldKey } from './parse/text';

// The record id is a stable hash of start + end + the sorted set of normalised
// place names (§10.5). Source and wording are deliberately excluded — those
// are exactly what differ between duplicates of the same event.
export function fingerprint(input: {
  startsAt: string;
  endsAt: string | null;
  areas: string[];
}): string {
  const places = [...new Set(input.areas.map(foldKey))].sort().join('|');
  const payload = `${input.startsAt}|${input.endsAt ?? 'open'}|${places}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
