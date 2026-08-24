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

Announcement language is quite formulaic. A typical sentence gives a reason, a
time range, and a list of settlements. So we apply rules first.

**Time range.** We recognise the common forms, such as
`09.00 ile 15.00 saatleri arasında` and `09:00 – 15:00`, and normalise the dot
separator to a colon. Where no end time is announced, we mark it unknown — we do
not invent one.

**Date.** Relative words like `bugün` (today) and `yarın` (tomorrow) are
resolved against the **announcement's publication date**, not against the time
our job runs. A job running at 00:05 must not read yesterday's "tomorrow" as
today.

**Place names.** We keep a list of every settlement with its district and its
alternative spellings. Turkish case rules matter here: `İ` and `I` do not map
the way they do in English, and a careless conversion corrupts `İSKELE`. We also
allow near-miss matching for typos, but only above a high similarity threshold,
and every approximate match is logged for review.

**Kind.** We classify planned, rotating or fault from the wording. The
difference between them is covered in
[a separate guide](/en/guides/outage-types).

**District.** Derived from the settlements matched. If an announcement spans
districts, we split it into one record per district, so that someone filtering
by district still sees their own.

If the rules cannot fully parse an announcement, a second stage sends the text
to a language model and asks for structured data only. We validate the response
against a schema — we never trust its shape as given — and records produced this
way are marked **"unverified"**. If you see that word on a card, it came through
this second stage.

If both stages fail, the announcement is not quietly dropped; it goes to a
review list with its original text.

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
