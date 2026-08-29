---
title: How this site collects and verifies its data
summary: The sources, the parsing, how duplicates are merged, and what we deliberately do not do.
updated: 2026-08-23
---

This site gathers electricity outage announcements into one place. We do not
cause outages, schedule them, or get told about them — we compile announcements
that anyone can read. This page explains exactly how.

We publish it because if you are giving someone information during an outage,
they are entitled to know where it came from and how far to trust it.

## The sources

There is no official data service. Announcements are published as plain prose
and republished by news outlets within minutes.

We follow five news outlets: **Yenidüzen**, **Kıbrıs Postası**,
**Detay Kıbrıs**, **Gündem Kıbrıs** and **Kıbrıs Gazetesi**.

You may notice KIB-TEK's own site is not on that list. It has a "Planlı
Kesintiler" (planned outages) section, but the section is empty — not one
announcement has ever been posted there. The utility's feed carries tenders and
technical specifications, not outages. We polled it for a while, got nothing
back, and dropped it. If the utility ever starts publishing there, we will add
it again.

So we do not treat the outlets as a fallback: they are where these
announcements actually appear.

Every record names the source it came from and links to the original
announcement.

## How often we look, and how

We check the sources **every ten minutes**. Nothing here changes faster than
that.

We try to be a polite visitor, because we are taking public data for a public
service:

- We identify ourselves with a contact address when we connect.
- We respect `robots.txt`.
- We do not re-download a page that has not changed.
- We make one request at a time to any one site, with a pause between them.
- If a site does not answer, we try at most three times and then leave it until
  the next round.

If one source goes down or slows, the others carry on. A single failing source
never stops the whole run.

## From prose to a record

A language model does the reading. We ask it for what the page says rather than
for an interpretation: the times, the date, the settlement names, and the kind
of outage — planned, rotating or fault ([the difference between
them](/en/guides/outage-types)). Its response is validated against our schema;
we never trust the shape it returns as given.

This replaced a stack of Turkish regexes — time formats, date ranges, weekday
words like `perşembe günü`. Announcement language looks formulaic until you sit
down to write the rules, and every new phrasing added another line to the list.

What happens after the reading is still ours:

**Place names.** We keep a list of every settlement with its district and its
alternative spellings, and the names the model returns are re-matched against
it; a name with no entry never reaches a record. Turkish case rules matter
here: `İ` and `I` do not map the way they do in English, and a careless
conversion corrupts `İSKELE`. We also allow near-miss matching for typos, but
only above a high similarity threshold, and every approximate match is logged
for review.

**Working out the day.** When an announcement says `perşembe günü`, we take the
weekday from the model but count the date ourselves — against the
**announcement's publication date**, not against the time our job runs. A job
running at 00:05 must not read yesterday's "tomorrow" as today. Asked to do
this arithmetic, the model gave the wrong day five times out of five; here it
is a subtraction, and a subtraction cannot be wrong.

**End time.** Where no end time is announced, we mark it unknown — we do not
invent one. A window crossing midnight, 22:00 to 02:00, ends the next day.

**District.** Derived from the settlements matched. If an announcement spans
districts, we split it into one record per district, so that someone filtering
by district still sees their own.

**When there is no start time.** An article about a fault already under way
usually does not say when the power went off. For those records we take the
article's publication time as the start and mark the card **"start time
unconfirmed"**. An outage carrying that note most likely began before the time
shown: a fault reaches the news after people have sat in the dark for a while.
We would rather be late than early, so that the map never claims an outage
nobody had.

If the model cannot parse an announcement, or not one familiar place name comes
out of it, the announcement is not quietly dropped; it goes to a review list
with its original text.

## Duplicates

With five sources, a single outage typically arrives four or five times.
Without collapsing them, you would see four cards for one event.

We match records on start time, end time, and the set of settlements. We
deliberately ignore the name of the source and the wording — those are exactly
what differ between duplicates.

Two details matter:

**When merging place lists, we take the union.** One outlet lists every village,
another abbreviates. If you live in a village that appears in only one outlet's
list, you still need to see it.

**We treat near-identical times as the same event.** Outlets round times, so if
two reports differ by less than fifteen minutes and their place lists overlap,
we treat them as one.

## Corrections and cancellations

Announcements get amended. If work is cancelled, we do not add a new record —
we **retract** the existing one. Retracted records disappear from the active and
upcoming lists but stay in the archive, marked as cancelled.

**We never delete records.** Corrections are applied as updates. The archive's
value depends on the history staying intact.

## What happens when the data goes stale

The top of every page shows when it was last updated. That value comes from the last
successfully completed collection run — it is not a fixed piece of text.

If the last successful check is more than an hour old, we say so on the page.
Presenting stale data as current is worse than an honest gap.

## What we deliberately do not do

**We do not store or republish article text.** We extract structured facts only:
date, time, place names, and the kind of outage. The writing stays at its source
and we link to it. That is both the correct position on copyright and a matter
of respect for the outlet's work.

**We do not scrape Facebook or anything behind a login.** Doing so would need
either an access key we cannot obtain or a session that breaks the platform's
terms. A public service is not built on that.

**We do not collect personal data.** We do not know who is looking at which
village, and we do not need to for this site to work.

## If you find a mistake

If a record looks wrong, write to us: <fathgnc.dev@gmail.com>. The link to the
card and a note about what is wrong is enough.

If your village appeared in an announcement but not here, it usually means our
place-name list is missing a spelling — which is an easy thing to fix.

The definitive answer is always KIB-TEK's own announcement. This site does not
replace it.
