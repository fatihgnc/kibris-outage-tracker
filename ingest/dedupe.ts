import type { Outage, SourceRef } from '../lib/types';
import { foldKey } from './parse/text';

// With six adapters a single outage typically arrives five or six times.
// Collapsing them is what keeps that from becoming five cards for one event.

// Outlets round times, so ranges within this window are the same event.
const TIME_TOLERANCE_MS = 15 * 60 * 1000;

function areaKeys(outage: Outage): Set<string> {
  return new Set(outage.areas.map(foldKey));
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function withinTolerance(a: Outage, b: Outage): boolean {
  const startDelta = Math.abs(Date.parse(a.startsAt) - Date.parse(b.startsAt));
  if (startDelta > TIME_TOLERANCE_MS) return false;
  if (a.endsAt === null || b.endsAt === null) return a.endsAt === b.endsAt;
  return Math.abs(Date.parse(a.endsAt) - Date.parse(b.endsAt)) <= TIME_TOLERANCE_MS;
}

// Two records describe the same event when they are in the same district and
// either their place sets nest (one outlet abbreviated the list) at exactly
// matching times, or their times are within tolerance and the places overlap.
export function isSameEvent(a: Outage, b: Outage): boolean {
  if (a.district !== b.district) return false;
  const aAreas = areaKeys(a);
  const bAreas = areaKeys(b);
  const exactTimes = a.startsAt === b.startsAt && a.endsAt === b.endsAt;
  if (exactTimes && (isSubset(aAreas, bAreas) || isSubset(bAreas, aAreas))) return true;
  return withinTolerance(a, b) && overlaps(aAreas, bAreas);
}

function isOfficial(outage: Outage): boolean {
  return outage.sources.some((source) => source.kind === 'official');
}

function mergeSources(a: SourceRef[], b: SourceRef[]): SourceRef[] {
  const merged = [...a];
  for (const source of b) {
    if (!merged.some((existing) => existing.url === source.url && existing.name === source.name)) {
      merged.push(source);
    }
  }
  // Official first: a reader trusts 'KIB-TEK' more than a newspaper name, and
  // the card footer shows sources[0].
  return merged.sort((x, y) => Number(y.kind === 'official') - Number(x.kind === 'official'));
}

// Merges `incoming` into `existing`. Place lists differ in completeness
// between outlets, so areas take the union rather than the first or the
// official version — a reader whose village appears in only one outlet's list
// still needs to see it (§10.5).
export function mergeOutages(existing: Outage, incoming: Outage): Outage {
  const authoritative = isOfficial(incoming) && !isOfficial(existing) ? incoming : existing;
  const areaByKey = new Map<string, string>();
  for (const area of [...existing.areas, ...incoming.areas]) {
    const key = foldKey(area);
    if (!areaByKey.has(key)) areaByKey.set(key, area);
  }
  const areas = [...areaByKey.values()];

  // The id stays the one the event already has. The fingerprint derives an id
  // for a *new* record; once a record exists, later sources merge into it and
  // must not renumber it, or every run would write a fresh row and re-running
  // would stop being idempotent (§10.5).
  return {
    ...existing,
    kind: authoritative.kind,
    startsAt: authoritative.startsAt,
    endsAt: authoritative.endsAt,
    areas,
    sources: mergeSources(existing.sources, incoming.sources),
    // Keep the earliest announcement time; the outlets are often faster than
    // the utility's own site.
    publishedAt:
      Date.parse(incoming.publishedAt) < Date.parse(existing.publishedAt)
        ? incoming.publishedAt
        : existing.publishedAt,
    ingestedAt:
      Date.parse(incoming.ingestedAt) > Date.parse(existing.ingestedAt)
        ? incoming.ingestedAt
        : existing.ingestedAt,
    // A record confirmed by a rules-parsed source is no longer low-confidence.
    confidence: existing.confidence === 'high' || incoming.confidence === 'high' ? 'high' : 'low',
  };
}

// Collapses a batch of freshly parsed records. Records are ordered by id
// first, so the surviving id is the lexicographically smallest of the group
// and the result does not depend on the order the adapters ran in.
export function dedupe(records: Outage[]): Outage[] {
  const collapsed: Outage[] = [];
  for (const record of [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const index = collapsed.findIndex((candidate) => isSameEvent(candidate, record));
    if (index === -1) collapsed.push(record);
    else collapsed[index] = mergeOutages(collapsed[index], record);
  }
  return collapsed;
}
