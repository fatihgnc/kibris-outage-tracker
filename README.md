# Sönen Ada — Dark Island

Power outage tracker for Northern Cyprus. Answers one question: **"Is the power
out in my area, and when does it come back?"**

Built to [SPEC.md](./SPEC.md). Current state: **Phases A, B and C built** — the
full frontend in Turkish and English, the ingest pipeline that collects outage
announcements from six public sources into Supabase, and the content and ad
layer: six guides plus about/privacy/terms in both locales, a consent banner,
and ad slots that reserve their height.

The one step nobody but the site owner can do is **applying for the ad account**
(SPEC §13 step 24). Until real ad ids are set, `AdSlot` renders nothing at all.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres) ·
d3-geo (projection only).

The island outline is real geometry (Natural Earth 1:50m), projected with
`geoMercator().fitExtent()`. Settlement points carry real coordinates and pass
through the same projection.

## Run

```bash
npm install
npx supabase start
npm run dev
```

Reads go through the single seam in `lib/data.ts`: Supabase via `lib/db.ts`, or
`lib/mock.ts` when `USE_MOCKS=true`. Components never import mocks or a
database client directly.

This project's local Supabase runs on a shifted port range (API `54421`, db
`54422`, Studio `54423`) so it does not collide with another local project.

## Ingest

```bash
npm run ingest
```

Cron-invoked standalone script, never a Next.js route. Add `--dry-run` to parse
without writing, `--no-fallback` to skip the LLM stage, or an adapter id to run
just one source. `npm run backfill` walks the outlets' archives for history.

Sources: `kibtek` (the utility) plus `yeniduzen`, `kibrispostasi`,
`detaykibris`, `gundemkibris`, and `kibrisgazetesi`. A single outage typically
arrives five or six times, so `ingest/dedupe.ts` collapses duplicates — taking
the **union** of place names, because outlets abbreviate the village list
differently. Each adapter is wrapped so one failure cannot abort the run.

Only structured facts are extracted — times, dates, places, outage kind. Article
text is never stored or republished; the card links back to the source.

```bash
npm test
```

Parser, dedupe, and fallback-validation unit tests, plus a store round-trip
against the local Supabase that skips when none is reachable.

## Keys

The **anon** key is read-only and used by the app. The **service role** key is
used only by `ingest/`; it bypasses row level security and must never appear in
a `NEXT_PUBLIC_*` variable, a component, or a route handler.

## Structure

- `app/[locale]/…` — routes, all nested under `tr` / `en`. `/` redirects via
  `proxy.ts` (cookie → `Accept-Language` → `tr`).
- `components/` — `IslandMap` (the one animated element), `IslandMapMini`,
  `OutageCard`, `KindBadge`, `Countdown`, `DistrictFilter`, `HistoryChart`,
  `StatusBar`, `LocaleSwitcher`.
- `lib/` — `types.ts` (the frontend/ingest contract), `data.ts` (read seam),
  `db.ts` (every Supabase query and row mapping), `mock.ts`, `time.ts`
  (Europe/Nicosia, duration/status helpers), `geography.ts` (outline +
  settlements), `i18n/` (dictionaries; the English one is type-checked against
  the Turkish one).
- `ingest/` — `run.ts` (entry point), `adapters/`, `parse/` (rules first, LLM
  fallback second), `dedupe.ts`, `store.ts`, `log.ts`, `backfill.ts`.
- `supabase/migrations/` — the schema. Applied with the Supabase CLI; never
  create or alter tables in the dashboard.
- `data/places.json` — every settlement with its district and aliases. Parsing
  quality is capped by this file.
- `content/guides/` and `content/pages/` — long-form content as markdown, one
  file per document per locale (`report-a-fault.tr.md`). No prose is written
  inline in a component.

## Content and advertising

The six guides and the about/privacy/terms pages are real reference material,
not filler: ad networks reject tool-only sites as thin content, and the outage
view is thin by their measure. The facts in them — the `188` fault line, the
regional office numbers, the fact that Lefke falls under the Güzelyurt region —
come from KIB-TEK's own published pages. The billing guide deliberately quotes
no prices, because tariffs change.

One rule overrides the rest of the ad layout: **no ad may sit between a person
and the answer they came for.** Nothing renders above the headline or the map,
nothing next to the countdown, and no unit appears on an empty result or while
the staleness warning is showing. `AdSlot` reserves its height before the unit
loads (measured CLS of 0), collapses cleanly when the network is blocked, and
renders nothing while `USE_MOCKS=true`.

Consent is asked once, at the bottom of the viewport. Rejecting is one click and
the same size as accepting, and a refusal is stored and never re-prompted.

All user-facing strings live in `lib/i18n/tr.ts` and `lib/i18n/en.ts` — never
inline in components. Place names stay in Turkish in both locales (SPEC §7.3).
