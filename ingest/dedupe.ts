import type { Outage, SourceRef } from '../lib/types';
import { foldKey } from './parse/text';
import { dedupeSources } from '../lib/sources';

// With five adapters a single outage typically arrives four or five times.
// Collapsing them is what keeps that from becoming four cards for one event.

// Outlets round times, so ranges within this window are the same event.
const TIME_TOLERANCE_MS = 15 * 60 * 1000;

// An open-ended fault has no announced start to round — parse/index.ts stands
// the announcement's own publication time in for one. Five outlets pick a fault
// up over the course of a day, so those five stand-ins are hours apart for what
// is one event, and the fifteen-minute window would file them as five.
//
// Wide enough to hold a day's coverage of one fault, and it only ever applies
// where both records are open-ended faults, in the same district, with
// overlapping places. Two genuinely separate faults hitting the same villages
// within six hours would merge; that is the rarer error, and a reader is better
// served by one card that starts slightly early than by five for one broken line.
const OPEN_FAULT_TOLERANCE_MS = 6 * 60 * 60 * 1000;

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

function bothOpenEndedFaults(a: Outage, b: Outage): boolean {
  return a.endsAt === null && b.endsAt === null && a.kind === 'fault' && b.kind === 'fault';
}

function withinTolerance(a: Outage, b: Outage): boolean {
  const startDelta = Math.abs(Date.parse(a.startsAt) - Date.parse(b.startsAt));
  if (bothOpenEndedFaults(a, b)) return startDelta <= OPEN_FAULT_TOLERANCE_MS;
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
  // Keyed on the article rather than the address: outlets rewrite an
  // announcement in place and change its slug with it, and the same piece
  // arriving under two URLs is one source, not two (lib/sources.ts).
  const merged = dedupeSources([...a, ...b]);
  // Official first: a reader trusts 'KIB-TEK' more than a newspaper name, and
  // the card footer lists them in this order.
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
  // An open-ended fault's start is a stand-in for one nobody announced, so the
  // earliest report of it is the closest thing to when the power actually went.
  //
  // The earliest wins outright here, ahead of the official-source rule that
  // decides the other fields. Being the utility's own announcement says nothing
  // about when a fault began — KIB-TEK confirms one after the outlets have
  // already run it — and letting it win made the merge asymmetric: the same two
  // records gave a different start depending on which arrived first, and dedupe
  // orders by id, which is a hash.
  const startsAt = bothOpenEndedFaults(existing, incoming)
    ? Date.parse(incoming.startsAt) < Date.parse(existing.startsAt)
      ? incoming.startsAt
      : existing.startsAt
    : authoritative.startsAt;

  return {
    ...existing,
    kind: authoritative.kind,
    startsAt,
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
    // A source that announced a start time settles the one we had to infer.
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
