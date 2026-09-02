import type { DistrictId, Outage } from './types';
import { readEndOf } from './time';

/**
 * One announcement, several districts, several records.
 *
 * An island-wide fault is filed once per district it names — the record's
 * identity is per district (ingest/dedupe.ts), and that is right for the
 * archive. But three cards for one event read as three events, and worse:
 * when one district's repair is reported and the others' are not, the reader
 * sees the same fault "ended 1 Eyl 08:45" in Lefke and "end not reported" in
 * Girne, side by side, and cannot tell whether the lights are back.
 *
 * So the cards group them. Records of one kind, all district-wide, starting
 * within a few minutes of each other, are one card led by an open record when
 * there is one — so the card stays in the live list exactly as long as the
 * map stays dark — and the others are named on it with their own state. Nothing is merged: every record keeps its page,
 * its sources and its place in the archive. Only the cards are fewer.
 *
 * District-wide only, on purpose. Two records that name villages are two
 * lists of villages, and the ingest already unions the lists that are one
 * announcement; what it cannot union is the district, and this is that gap.
 */

// How far apart two district-wide records may start and still be one event.
// Outlets round the clock differently; five minutes covers the rounding and
// stops short of the next scheduled window.
const SAME_START_MS = 5 * 60 * 1000;

export type Sibling = { district: DistrictId; endsAt: string | null };

export type EventCard<T extends Outage> = { lead: T; siblings: Sibling[] };

export function groupSiblings<T extends Outage>(records: readonly T[]): EventCard<T>[] {
  const taken = new Set<string>();
  const cards: EventCard<T>[] = [];
  for (const record of records) {
    if (taken.has(record.id)) continue;
    const members =
      record.scope === 'district'
        ? records.filter(
            (other) =>
              !taken.has(other.id) &&
              other.scope === 'district' &&
              other.kind === record.kind &&
              Math.abs(Date.parse(other.startsAt) - Date.parse(record.startsAt)) <= SAME_START_MS,
          )
        : [record];
    for (const member of members) taken.add(member.id);
    // An open record leads — the card is live while any member is — and among
    // open ones the earliest filed, whose clock the others were rounded from.
    // With every member closed, the one that ended last leads.
    const open = members.filter((member) => !member.endsAt);
    const lead = open.length
      ? [...open].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
      : [...members].sort((a, b) => readEndOf(b) - readEndOf(a))[0];
    cards.push({
      lead,
      siblings: members
        .filter((member) => member.id !== lead.id)
        .map((member) => ({ district: member.district, endsAt: member.endsAt })),
    });
  }
  return cards;
}
