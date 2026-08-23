# Sönen Ada — Dark Island

Power outage tracker for Northern Cyprus. Answers one question: **"Is the power
out in my area, and when does it come back?"**

Built to [SPEC.md](./SPEC.md). Current state: **Phase A complete** — the full
frontend (home, district pages, archive) running against mock data in Turkish
and English. Phase B (Supabase + ingest pipeline) and Phase C (guides, legal
pages, ads) are not started; see SPEC.md §13 for the build order.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · d3-geo (projection only).

The island outline is real geometry (Natural Earth 1:50m), projected with
`geoMercator().fitExtent()`. Settlement points carry real coordinates and pass
through the same projection.

## Run

```bash
npm install
npm run dev
```

`USE_MOCKS=true` (set in `.env.local`) keeps every read on `lib/mock.ts`
through the single data seam in `lib/data.ts`. Components never import mocks or
a database client directly.

## Structure

- `app/[locale]/…` — routes, all nested under `tr` / `en`. `/` redirects via
  `proxy.ts` (cookie → `Accept-Language` → `tr`).
- `components/` — `IslandMap` (the one animated element), `IslandMapMini`,
  `OutageCard`, `KindBadge`, `Countdown`, `DistrictFilter`, `HistoryChart`,
  `StatusBar`, `LocaleSwitcher`.
- `lib/` — `types.ts` (the frontend/ingest contract), `data.ts` (read seam),
  `mock.ts`, `time.ts` (Europe/Nicosia, duration/status helpers),
  `geography.ts` (outline + settlements), `i18n/` (dictionaries; the English
  one is type-checked against the Turkish one).

All user-facing strings live in `lib/i18n/tr.ts` and `lib/i18n/en.ts` — never
inline in components. Place names stay in Turkish in both locales (SPEC §7.3).
