# kesintimivar.com — Product & Design Spec

**Power outage tracker for Northern Cyprus**
Version 0.1 · Frontend-only scope with mocked data

---

## 0. Language policy

**All code is English.** Variable names, types, enum members, component names,
file names, CSS custom properties, route segments, query parameters, slugs, and
comments — English, without exception.

**The interface ships in two languages: Turkish and English.** Northern Cyprus
has a large non-Turkish-speaking population — university students and long-term
foreign residents — and a power outage affects them identically. English is a
first-class locale, not a courtesy translation.

**No user-facing string is ever written inline in a component.** Every one lives
in the locale dictionaries described in §7.

See §7 for the full internationalisation contract.

---

## 1. Product

### 1.1 What it is

A public, free web service that answers one question:

> **"Is the power out in my area, and when does it come back?"**

Every design and engineering decision in this document serves that question. If
a feature does not help someone answer it within two seconds of opening the
page, it does not belong in v1.

### 1.2 Who uses it

- Residents of Northern Cyprus, all ages, average technical literacy.
- Majority arrive on **mobile**, one-handed, in a hurry, often while the power
  is already out — so possibly on cellular data and a low battery.
- Secondary audience: local journalists and village administrators who want
  historical outage data.

### 1.3 Scope

**In scope:** the full frontend — routes, components, states, visual system —
the ingest pipeline that collects outage announcements from public sources and
parses them into structured records, and the written content and ad layer that
funds hosting.

**Out of scope for now:** notifications, the Telegram bot, and user-submitted
outage reports.

Build the frontend against mocks first, the ingest second, and content and ads
last (§13). Frontend and ingest meet at one place only: `lib/types.ts`. The
frontend never knows where a record came from, and the ingest never knows how a
record is displayed.

### 1.4 Non-negotiable disclaimer

Announced outages get cancelled, cut short, or extended. The UI must never
present a time as a guarantee. Every duration is labelled as an estimate, and a
persistent notice appears in the footer of every page.

---

## 2. Design direction: the island going dark

The hero is the island itself. Cyprus is drawn as a silhouette with settlements
as points of light. Where power is on, the point glows. Where there is an
outage, it goes dark.

The dark background is **not** a stylistic preference — it is the subject
matter. An island at night, with lights going out. Hold this metaphor
consistently and do not undercut it elsewhere in the UI.

### 2.1 Color tokens

Define these as CSS custom properties. **Do not introduce colors outside this
set.** No gradients anywhere.

| Token           | Hex       | Use                                           |
| --------------- | --------- | --------------------------------------------- |
| `--color-night` | `#0B1220` | Page background                               |
| `--color-lamp`  | `#F5C86B` | Power on, primary accent, focus ring          |
| `--color-dark`  | `#2A3446` | Unlit point, inactive rules, borders          |
| `--color-fault` | `#E5573F` | Unplanned fault, on badges and cards only     |
| `--color-text`  | `#C9D1DC` | Body text                                     |
| `--color-muted` | `#7C8699` | Secondary text, meta, timestamps, map outline |

Surface elevation is expressed with **1px borders in `--color-dark`**, not
shadows. Glow — a soft radial blur — is permitted **only** on lit map points,
never on cards, buttons, or badges.

### 2.2 Typography

| Role                                     | Family                  | Notes                                   |
| ---------------------------------------- | ----------------------- | --------------------------------------- |
| Display / headings                       | **Fraunces** (variable) | Use the `opsz` axis, weight 600         |
| Body                                     | **Public Sans**         | 16px base                               |
| Numeric: times, dates, durations, counts | **IBM Plex Mono**       | Slight negative tracking at large sizes |

Define a scale of **at most five steps** and do not add intermediate sizes.
Suggested: `display 48/56` · `h2 24/32` · `body 16/26` · `small 14/22` ·
`meta 13/18`.

The mono face carries all data. This is the main typographic idea of the site:
prose is human, numbers are machine-read. Keep the split clean.

---

## 3. Signature element: the island map

This is the one memorable thing on the site. Everything else stays quiet.

### 3.1 Geometry — use real data

**Do not hand-draw a polyline.** The first attempt did, and the result was not
recognizable as Cyprus.

- Source a simplified **GeoJSON** outline of Cyprus. The whole island is drawn;
  the northern portion is the active area.
- Project with **`d3-geo`** (`geoMercator().fitSize()`) into the SVG viewBox.
  Never scale coordinates by hand.
- Settlement points are declared with **real latitude and longitude** and pass
  through the same projection, so a point can never drift off the coastline.

### 3.2 Settlement points

**One point for every name the ingest can match.** `data/places.json` (§10.4) is
the canonical list an announcement's areas are resolved against, so anything in
it can appear in a record — and anything that can appear in a record needs a
lamp, or the outage has nowhere to show.

Coordinates are not typed by hand. `npm run harvest:coords` looks every name up
in OpenStreetMap, rejects any match outside the service area, and writes
`lib/geo/settlements.json`. Names OSM cannot place are sourced by hand in
`lib/geo/settlements.overrides.json`, each with a note saying where its
coordinate came from; names with no defensible point at all are declared
`unplaceable` there. `lib/geography.test.ts` fails if the two files drift, so a
place list that has grown past the map is caught in CI rather than on the page.

**A coordinate can be wrong in two ways, and only one of them matters.** OSM
place nodes are surveyed, so a lamp is not going to be off by a street. What it
can be is the *wrong village* — and that is only possible where a name is held
by more than one place in the north. 178 of the 194 names match exactly one, so
there is nothing there to get wrong; the harvest prints the handful that needed
a choice, with what it took and what it passed over, and those are the lines to
read after a run.

Where it has to choose, the claim on the name decides: a settlement in its own
right over a quarter of a larger one, and a node OSM has given a Turkish name to
over one it has not. The district polygon is **not** the authority — it is the
shape the map is drawn with, and its Girne reaches east over Değirmenlik while
stopping short of the Koruçam peninsula. Letting it decide handed Tepebaşı to a
neighbourhood outside Değirmenlik instead of the village west of Girne that OSM
tags `name:tr=Tepebaşı`. It now only breaks what is still a tie.

**Every lamp is the same size.** Radius used to scale with a `weight` taken
from what OSM called the place. The map says one thing — whether the power is on
here — and how large a place is says nothing about that; drawing it anyway made
a city's outage look like the bigger event when the map has no way of knowing
that it is, and dressed a tag up as data the map does not hold. 179 of the 192
places fell into the same bucket in any case.

The light of a hundred and ninety lamps adds up: the radii in
`lib/map-style.ts` are set for that density, and the ones that suited
twenty-six lamps turn the middle of the island into one sheet of amber.

Place names are data, not code — they stay in their real Turkish spelling. The
identifiers that reference them are English (`settlements`, `district`, `name`).

### 3.3 Point states

| State   | Appearance                                     |
| ------- | ---------------------------------------------- |
| Powered | `--color-lamp` core with its glow             |
| Outage  | `--color-muted` dot at half opacity, no glow  |

**An unlit place is dark, not absent.** The lamp's glow and its amber core fade
away and a cold dot is left standing where they were — the village is still on
the island, still findable, still hoverable, and the reader can see that this is
the one that has gone out. Removing the point entirely was the first attempt and
it read as the place having been deleted from the map at the exact moment it
mattered most.

The cold dot is *wider* than the lit core it replaces. The frame is a thousand
units drawn into at most eight hundred pixels, so a core is about a pixel
across; what makes a lit point legible is the glow around it, and an unlit point
has none. It is also drawn outside the `screen` blend group the lamps live in —
that blend can only add light, so anything darker than the ground is invisible
inside it.

An unlit point is unlit. It does **not** turn red — a light that has gone out
does not burn red, and the earlier red-ring treatment broke the metaphor. The
planned/fault distinction is communicated on the **cards** and in the point's
popover (§3.6), not in the colour of the light.

**Districts carry no power state.** They are the ground the light sits on and
the thing a reader clicks; an outage is one or more places going dark, and a
district is not a place. An earlier pass shaded the whole of a district under
any outage inside it, which said every village in Lefkoşa was out when the
record named three. Where an outage names only places the map cannot place —
the handful declared in §3.2 — nothing goes out, and the list below the map is
where it is read.

### 3.4 Outline legibility

The outline must read as a silhouette. Draw it in `--color-muted` at hairline
weight, with a very faint interior fill just above `--color-night`. In the first
pass the outline was drawn in `--color-dark` and effectively vanished.

The district borders inside it are drawn in the same tone at half the width and
half the opacity — the island reads as one shape first and a set of districts
second. They were `--color-dark` too, four shades off the land they sat on and
invisible in practice; now that no district is named on the map (§3.6) they are
the only thing saying where one ends, so they have to read.

### 3.5 The one animation

On first paint of the home page, and nowhere else:

1. Points ignite **west to east**, staggered, total duration around 900ms.
2. Points currently under an outage then fade to dark over 400ms.

This is the single orchestrated moment on the site. Do not add scroll reveals,
staggered card entrances, or any other entrance animation anywhere.

Under `prefers-reduced-motion: reduce`, skip the sequence entirely and paint the
final state immediately.

### 3.6 Map interaction

- **Hovering reads a place; clicking opens a district.** The click target is the
  district polygon, not the point: a lamp is two units across and there are a
  hundred and ninety of them. The keyboard tab stops are the six districts for
  the same reason — one per village would put a hundred and ninety of them
  between the header and the list.
- Hovering the map surfaces the nearest lamp within a small radius in a
  **popover** anchored to it: the settlement's name, whether the power is on,
  and — when it is not — the kind of outage, its time range, and the source that
  carried it. It answers the whole question at the point, so a reader does not
  have to find the matching card to learn what is wrong.
- The popover is **never interactive**. It opens on hover and would take the
  pointer with it, so nothing inside it could be reached; the source is named in
  plain text and the list under the map carries the link.
- The same sentence goes to an `aria-live` line under the map, which is also
  where the hint sits when nothing is hovered.
- **No names are written on the map at all** — not the settlements', and not the
  districts'. The six district names used to be, and carrying them was expensive
  out of all proportion to what they gave: `lib/geo/build-layout.ts` ran a grid
  sweep per district looking for somewhere each name could sit that was on land,
  clear of the coast, clear of the other five, and out of the lamp light, and
  that search was 99% of the map build — 5.9 seconds of it, against 8 milliseconds
  for everything else. The island's shape orients a reader on its own, and the
  popover names the place under the pointer.
- Focus ring in `--color-lamp`, clearly visible against `--color-night`.

### 3.7 How big the map is

**The map runs the full width of the window**, breaking out of the page column
that everything else on the page sits in. Its height is whatever the island's
proportions make it; nothing caps it.

This reverses an earlier rule, and the reason is worth keeping. The map used to
be capped at 480px against `52vh` so that the outage list started above the
fold. That put the island at 646 pixels on a 1280 pixel window — a village core
three quarters of a pixel across, villages fused into their neighbours' glow,
and the lamp-for-every-place the map is built on unreadable. A map that cannot
be read is not worth the space it was being given. The list moved below the
fold on desktop; the map became legible.

On a phone nothing is really lost either way: at 375px the island is 375 by 218
and the list heading still lands inside the viewport, so the old rule holds
there by the aspect ratio alone rather than by a cap.

Two things this costs, both paid in `app/globals.css` and
`components/IslandMap.tsx`:

- `100vw` counts the vertical scrollbar, so the map overshoots the document by
  its width. `overflow-x: clip` is set on **both** `html` and `body` — overflow
  on the root element is handed to the viewport, and clipping `body` alone lets
  the overshoot escape. `clip` and not `hidden`: `hidden` would make the element
  a scroll container and take `position: sticky` with it.
- The district labels were HTML at a fixed pixel size and did not grow with the
  frame, so they read as an afterthought on a map twice the size. They are gone
  entirely (§3.6).

### 3.8 Map on the district page

The district page renders a **small, static** variant: whole island muted, the
one district's points highlighted. No animation, no interaction. This keeps the
two pages feeling like the same product — in the first pass the district page
had no map at all and read like a different site.

At this size the light is a flat fill rather than the radial source: a gradient
reads as a smudge. The halo is pulled well in from the radius the big map uses —
İskele alone holds fifty lamps, and at full size the district came out as one
solid patch instead of a scatter of villages.

---

## 4. Data model

```ts
export type OutageKind = 'planned' | 'fault' | 'rotating';

export type Utility = 'electricity'; // union kept open for future services

export type DistrictId =
  | 'lefkosa'
  | 'girne'
  | 'gazimagusa'
  | 'guzelyurt'
  | 'iskele'
  | 'lefke';

export type SourceRef = {
  name: string; // 'KIB-TEK', 'Yenidüzen', ...
  url: string; // link to the original announcement
  kind: 'official' | 'press';
};

export type Outage = {
  id: string; // stable, derived — see §10.5
  utility: Utility;
  kind: OutageKind;
  startsAt: string; // ISO 8601
  endsAt: string | null; // null = end time unknown, typical for faults
  district: DistrictId;
  areas: string[]; // affected villages / neighbourhoods
  sources: SourceRef[]; // one record may be confirmed by several sources
  publishedAt: string; // ISO 8601, when the announcement went out
  ingestedAt: string; // ISO 8601, when this record entered the system
  confidence: 'high' | 'low'; // 'low' = parsed by fallback, see §10.4
};

export type Settlement = {
  name: string;
  lat: number;
  lng: number;
  district: DistrictId;
};

export type MonthlyTotal = {
  month: string; // 'YYYY-MM'
  plannedHours: number;
  faultHours: number;
};
```

`sources` is an array because the same outage is typically announced by the
utility and then republished by several outlets; §10.5 explains how duplicates
collapse into one record. Order it official-first, and display the first entry
in the card footer — a reader trusts "KIB-TEK" more than a newspaper name, and
that difference is worth surfacing.

Derived status, computed from `startsAt` / `endsAt` against the current time —
never stored:

```ts
export type OutageStatus = 'active' | 'upcoming' | 'past';
```

### 4.1 Mock data rules

Put mocks in `lib/mock.ts`. **Realism matters** — unrealistic mock data leads to
design decisions made against information the product will never actually show.

- **Times are always on the hour or half hour**: `09:00–11:00`, `10:00–12:00`,
  `09:00–15:00`. The first pass generated `07:59–12:59` and `05:11–08:11`; real
  announcements never look like that.
- Typical durations: planned 2–6h, rotating 1–4h, faults have `endsAt: null`.
- `publishedAt` is rounded and always **precedes** `startsAt`.
- Ship around 14 records: a few currently active, several upcoming, several past
  so the archive and the twelve-month chart have something to render.
- Use **real place names**: Gönyeli, Hamitköy, Alayköy, Lapta, Alsancak,
  Karaoğlanoğlu, Zümrütköy, Kalkanlı, Yeşilyurt, Yeniboğaziçi, Mutluyaka,
  Kumyalı, Boğaztepe, Gemikonağı, Doğancı, Sütlüce, Pınarlı, Ulukışla,
  Gönendere, Tirmen, Ergenekon.

---

## 5. Routes

Route segments and query parameters are English. Every route is nested under a
locale segment: `/[locale]/...` where locale is `tr` or `en`.

`/` redirects to the resolved locale (§7.2). Both `/tr` and `/en` are real,
indexable URLs — a shared link must open in the language it was shared in.

### 5.1 `/[locale]` — Home

Top to bottom:

1. **Status bar**, full width, one line: current overall state on the left, last
   check time and the language switcher on the right.
2. **Headline**: one sentence stating the situation, and below it one line
   naming the next event with its estimated countdown.
3. **Island map** (§3), with a short mono hint beneath telling the reader that
   tapping a light opens that district.
4. **District filter**: an "all" option plus the six districts, as horizontally
   scrollable chips. Selection lives in the **URL query**
   (`/?district=girne`) so the view is shareable — not in localStorage.
5. **Outage list**: active and upcoming, sorted by time. Responsive card grid,
   3 columns desktop / 2 tablet / 1 mobile.
6. **Footer** with the persistent disclaimer.

### 5.2 `/[locale]/district/[id]` — District

1. Back link to the map.
2. District name as display heading with a one-line summary.
3. **Small static map variant** (§3.8).
4. **Now** — the active outage, or the empty state.
5. **Upcoming** — upcoming outages, or the empty state.
6. **Last twelve months** — history chart (§6.5).

Center the content column at **max-width 880px**. The first pass left content in
a narrow column on a wide page with a large empty right side.

### 5.3 `/[locale]/archive` — Archive

Past outages, filterable by district and month. Flat chronological list, grouped
by month, using a compact variant of the outage card.

The archive is what makes this more than a notice board: after six months it is
a dataset nobody else has. Treat it as a first-class page, not an afterthought.

### 5.4 `/[locale]/guides` and `/[locale]/guides/[slug]` — Guides

Written explainers, one per page, in both locales. These exist for two reasons:
they are genuinely useful, and a site that is only a tool gets rejected by ad
networks as thin content (§11.2).

Launch set, roughly 600–1,200 words each, written as real reference material:

- How to report a fault and which number to call
- What the difference is between a planned, rotating, and fault outage
- What to do during a long outage: food safety, water pumps, medical devices
- How electricity billing and tariffs work
- Protecting appliances from surges when power returns
- How this site collects and verifies its data

Index page lists them with a one-line summary. No outage cards on these pages.

### 5.5 `/[locale]/about`, `/[locale]/privacy`, `/[locale]/terms`

Required, and not boilerplate. `about` states plainly who runs the site, that it
is independent of the utility, where the data comes from, and how to make
contact — including a working email address.

`privacy` must describe cookies, analytics, and advertising honestly, including
the third-party ad cookies described in §11. An ad network will check for this
page before approving the site, and a person deserves it regardless.

---

## 6. Components

### 6.1 `OutageCard`

The workhorse. Vertical order inside the card:

1. **Meta row**: kind badge on the left, status text on the right in mono and
   muted.
2. **Time block**: the time range in large mono. The most prominent element in
   the card. When the end is unknown, the range shows the start followed by the
   "unknown" string from the active dictionary.
3. **Context line**, mono and muted: the date plus the estimated countdown.
4. **Divider**, 1px `--color-dark`.
5. **District name** in the display face, and **affected areas** in body text.
6. **Footer row**, mono and muted: publish time, and the source as a link
   labelled with the organisation name from `sources[0]`, underlined so its
   affordance is obvious. When `confidence` is `low`, append the "unverified"
   string from the dictionary here — quietly, in muted text, not as a warning
   banner.

**Density:** the first pass produced cards too tall to scan. Cut vertical
padding, keep horizontal padding. Target **4–5 records visible** in the first
viewport on a laptop.

### 6.2 `KindBadge`

Three variants, keyed to `OutageKind`: planned uses `--color-lamp`, fault uses
`--color-fault`, and rotating sits between the two in visual weight — a rotating
outage is worse news for the reader than a planned one and must not look
identical to it.

Uppercase, mono, letterspaced, 1px border, transparent fill. Every badge
**contains its own text**, so color is never the sole carrier of meaning.

### 6.3 `Countdown`

Relative time, mono, ticking once per minute. The "estimated" qualifier must
always appear alongside it. Never render a countdown that implies precision the
data does not have.

### 6.4 `DistrictFilter`

Seven chips in a horizontally scrollable row. The selected chip takes a
`--color-lamp` border and text. Writes to the URL query.

### 6.5 `HistoryChart`

Twelve-month stacked bar chart, one bar per month, fed by `MonthlyTotal[]`:

- Planned hours in a lighter tone of `--color-dark`, fault hours in
  `--color-fault`.
- Print an absolute value above the tallest bar, or run a thin axis on the left.
  In the first pass bars could only be read relative to each other, with no
  magnitude anywhere on screen.
- Legend below, naming both series.
- Hover and keyboard focus reveal that month's figures.

### 6.6 `StatusBar`

Single line at the top of every page. Current state on the left, last check time
and the language switcher on the right. Mono, muted, no background fill.

### 6.7 `LocaleSwitcher`

Two labels, `TR` and `EN`, separated by a thin rule. The active one takes
`--color-lamp`, the other `--color-muted`. Mono, small.

- Renders as real anchors to the same page in the other locale, so it works
  without JavaScript and can be opened in a new tab.
- Preserves the full path and every query parameter. Switching language from a
  filtered district view must land on the same filtered district view.
- Writes the choice to a cookie (§7.2) on click.
- Accessible name states the target language in that language: `Türkçe`,
  `English`. Never rely on flag icons — a flag names a country, not a language,
  and the audience here is not one nationality.

---

## 7. Copy and internationalisation

### 7.1 Structure

Two locales, `tr` and `en`, both first-class. Turkish is the default.

```
lib/i18n/
  config.ts        # Locale type, locales list, defaultLocale
  dictionaries.ts  # loader
  tr.ts
  en.ts
```

Both dictionaries satisfy the same TypeScript type, derived from the Turkish
one, so a missing English key is a **compile error** rather than a blank space
in production. Keys are English and describe meaning, not position:
`status.outageInProgress`, not `homeLine1`.

Dictionaries are loaded server-side and passed down as props. Do not ship a
client-side i18n runtime; there are two languages and a fixed string set.

### 7.2 Locale resolution

On a request to `/`, in order:

1. A `locale` cookie, if it holds a valid locale.
2. The `Accept-Language` header, matched against the supported list.
3. Fall back to `tr`.

Redirect to the resolved locale. Once a person uses the switcher, the cookie
wins over the header from then on — an English speaker on a Turkish-configured
phone should not be re-redirected on every visit.

### 7.3 What does not get translated

**Place names stay in Turkish, in both locales.** Gönyeli is Gönyeli. Road
signs, utility announcements, and map apps all use the Turkish name, so
translating or transliterating it would actively hinder someone trying to find
out whether their own village is affected. This applies to settlements and
districts alike.

The one exception is the district name in the English locale, where a widely
used English exonym exists and appears in parentheses on the district page
heading only: Lefkoşa (Nicosia), Gazimağusa (Famagusta), Girne (Kyrenia). Do not
propagate these into lists, cards, chips, or the map.

### 7.4 Formatting

Locale-aware, via `Intl`:

- **Dates**: `Intl.DateTimeFormat` with the active locale. Weekday and month
  names come from the platform, never from a hand-written array.
- **Durations**: Turkish and English have different plural and unit rules, so
  build the duration string from dictionary fragments rather than concatenating
  a number with a fixed suffix. `2 sa 10 dk` and `2 hr 10 min`.
- **Relative phrasing**: `bugün` / `today`, `yarın` / `tomorrow` come from the
  dictionary, not from date arithmetic on a Turkish string.
- **Clock**: 24-hour in both locales. This is a utility, and the source
  announcements are 24-hour. Do not switch English to AM/PM.
- **Numbers**: `Intl.NumberFormat` with the active locale for the chart totals.

### 7.5 Tone

Plain, serious, not bureaucratic, in both languages.

**Translate the utility's language into the citizen's language.** Say the power
will be cut, not that energy cannot be supplied. In English, avoid the same trap
from the other direction: "outage" and "power cut" are both fine, "de-energised"
is not.

The English is written, not machine-translated from the Turkish. Some Turkish
lines will not map one-to-one and should be rewritten so they read naturally to
a resident whose first language is not Turkish. Keep both versions at a similar
length so the layout holds — English tends to run longer, and the time block and
badges have fixed room.

**Empty states are invitations, not silence.** Always state when the data was
last checked alongside the fact that nothing is scheduled.

**Errors say what happened and what to do.** No apologising, no vagueness: name
the failure, then show the last known state and its timestamp.

**Labels name what the user controls**, never how the system is built, and an
action keeps the same word throughout a flow in both languages.

### 7.6 Document metadata

- `<html lang>` reflects the active locale.
- Per-locale `<title>` and meta description.
- Reciprocal `hreflang` link tags between `tr` and `en`, plus `x-default`.
- Per-locale Open Graph metadata, so a link shared in a foreign-resident group
  previews in the right language.
- The persistent disclaimer (§1.4) is translated and carries equal weight in
  both locales. It is a safety notice, not decoration.

---

## 8. Technical

- **Next.js (App Router) + TypeScript + Tailwind.**
- Server Components by default. Client Components only where interaction
  genuinely requires them: map, countdown, filter chips, chart tooltip.
- Colors as CSS custom properties in `globals.css`, surfaced to Tailwind via
  `theme.extend.colors`. No hardcoded hex values in components.
- Fonts via `next/font`, subset for Latin Extended so Turkish characters
  (ı, İ, ş, ğ, ü, ö, ç) render correctly.
- `d3-geo` for projection. Do not pull in full `d3`.
- **Single data seam:** every read goes through `lib/data.ts`. It reads mocks
  while `USE_MOCKS=true` and the database otherwise. Components never import
  `mock.ts` or touch the database directly.
- **Storage: Supabase** (hosted Postgres). Access it through the JS client, and
  keep every query inside `lib/db.ts` — no Supabase client instance is ever
  imported by a component. See §8.1 for the schema and access rules.
- Time handling in the `Europe/Nicosia` zone. Compute all relative times against
  a single injected "now" so rendering is testable and server and client agree.
  Store timestamps as `timestamptz` in UTC and convert at the edges only.
- Ingest runs as a standalone Node script invoked by cron, not inside a Next.js
  route. It must be runnable by hand: `npm run ingest`.

### 8.1 Supabase

**Keys.** Two, and they must never be confused:

- The **anon** key is used by the Next.js app for reads. It may appear in
  server-side env; the app is read-only, so nothing here needs elevated rights.
- The **service role** key is used _only_ by the ingest script. It bypasses row
  level security. It lives in the ingest environment, never in `NEXT_PUBLIC_*`,
  never in a component, never in a route handler.

Fail the build if a service role key is referenced from anything under `app/` or
`components/`.

**Row level security.** Enable RLS on every table. Grant `select` to `anon` on
`outages` and `ingest_runs`. Grant nothing else — no insert, no update, no
delete. Writes happen exclusively through the service role from the ingest.
`review_queue` is not readable by `anon` at all; it holds unparsed raw text and
is for the maintainer only.

**Schema.**

```sql
create type outage_kind as enum ('planned', 'fault', 'rotating');
create type utility_kind as enum ('electricity');
create type confidence_level as enum ('high', 'low');

create table outages (
  id            text primary key,          -- fingerprint hash, §10.5
  utility       utility_kind not null default 'electricity',
  kind          outage_kind not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,               -- null = unknown
  district      text not null,
  areas         text[] not null,
  sources       jsonb not null,            -- SourceRef[]
  published_at  timestamptz not null,
  ingested_at   timestamptz not null default now(),
  confidence    confidence_level not null default 'high',
  cancelled_at  timestamptz,               -- non-null = retracted, §10.6
  updated_at    timestamptz not null default now()
);

create index outages_starts_at_idx on outages (starts_at desc);
create index outages_district_idx  on outages (district, starts_at desc);
create index outages_active_idx    on outages (starts_at, ends_at)
  where cancelled_at is null;

create table ingest_runs (
  id             bigserial primary key,
  started_at     timestamptz not null,
  finished_at    timestamptz,
  ok             boolean not null default false,
  adapters_ok    text[] not null default '{}',
  adapters_failed text[] not null default '{}',
  created_count  int not null default 0,
  updated_count  int not null default 0,
  review_count   int not null default 0
);

create table review_queue (
  id          bigserial primary key,
  source      jsonb not null,
  raw_text    text not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
```

Columns are `snake_case` per Postgres convention; map them to the camelCase
types in §4 inside `lib/db.ts` and nowhere else.

**Writes are upserts.** The ingest calls `upsert` on `outages` keyed by `id`, so
re-running is idempotent (§10.5). Merging `sources` and preserving the earliest
`published_at` happens in the ingest before the upsert, not in SQL.

**Migrations** live in `supabase/migrations/` and are applied with the Supabase
CLI. Do not create tables by hand in the dashboard — the schema must be
reproducible from the repository.

**Local development** runs against `supabase start`, not the hosted project. The
ingest is destructive enough that pointing it at production while iterating will
eventually cost you data.

**"Last checked" comes from `ingest_runs`,** not from a hardcoded value: the
most recent row where `ok` is true. This is what the status bar reads and what
the staleness check in §10.7 compares against.

### 8.2 Suggested structure

```
app/
  [locale]/
    layout.tsx
    page.tsx                  # home
    district/[id]/page.tsx
    archive/page.tsx
    guides/page.tsx
    guides/[slug]/page.tsx
    about/page.tsx
    privacy/page.tsx
    terms/page.tsx
  globals.css
middleware.ts                 # locale resolution + redirect
components/
  IslandMap.tsx               # client
  IslandMapMini.tsx           # static district variant
  OutageCard.tsx
  KindBadge.tsx
  Countdown.tsx               # client
  DistrictFilter.tsx          # client
  HistoryChart.tsx
  StatusBar.tsx
  LocaleSwitcher.tsx
  AdSlot.tsx                  # network unit or local sponsor, §11
  ConsentBanner.tsx           # client
content/
  guides/                     # MDX or markdown, one file per guide per locale
lib/
  data.ts                     # the read seam — mocks or db
  db.ts                       # all Supabase queries + row mapping
  supabase.ts                 # anon client factory (read-only)
  mock.ts
  types.ts
  time.ts                     # duration formatting, status derivation
  geography.ts                # GeoJSON + settlement coordinates
  i18n/
    config.ts
    dictionaries.ts
    tr.ts
    en.ts
ingest/
  run.ts                      # entry point: npm run ingest
  supabase.ts                 # service-role client — ingest only
  adapters/
    kibtek.ts                 # official site
    yeniduzen.ts
    kibrispostasi.ts
    detaykibris.ts
    gundemkibris.ts
    kibrisgazetesi.ts
    types.ts                  # SourceAdapter interface
  parse/
    datetime.ts               # date and time-range extraction
    places.ts                 # place-name matching to settlements
    kind.ts                   # planned / fault / rotating classification
    fallback.ts               # LLM fallback, see §10.4
  dedupe.ts
  store.ts                    # upserts into Supabase
  log.ts                      # writes ingest_runs rows
supabase/
  migrations/                 # schema, applied via the Supabase CLI
data/
  places.json                 # canonical place list + aliases
lib/geo/
  cyprus.geo.json             # coastline, north outline, six districts (WGS84)
  settlements.json            # one lamp per place, written by harvest:coords
  settlements.overrides.json  # hand-sourced coordinates + declared exceptions
  map-layout.json             # the projected map, written by build:map
```

**Environment variables.**

```
NEXT_PUBLIC_SUPABASE_URL       # app + ingest
NEXT_PUBLIC_SUPABASE_ANON_KEY  # app only
SUPABASE_SERVICE_ROLE_KEY      # ingest only — never NEXT_PUBLIC_*
USE_MOCKS                      # 'true' during Phase A
```

---

## 9. Quality floor

Meet these without announcing them in the UI.

- Responsive down to **360px**.
- Visible keyboard focus everywhere, ring in `--color-lamp`.
- Contrast at **WCAG AA** for all text. `--color-muted` on `--color-night` must
  be verified, not assumed.
- Color never carries meaning alone.
- `prefers-reduced-motion` respected.
- Map points are real interactive elements with accessible names, not decorative
  SVG circles.
- Semantic HTML: outage lists are lists, times use `<time datetime="...">`.
- No layout shift when the countdown ticks — reserve the width.
- Both locales render every page without overflow at 360px. English strings run
  longer; check badges, chips, and the time block specifically.
- `<html lang>` correct in both locales, so screen readers pick the right voice.
- The language switcher is reachable by keyboard and works with JavaScript
  disabled.

---

## 10. Ingest pipeline

### 10.1 Sources

There is no official API. Announcements are published as prose and republished
by news outlets within minutes — in practice the outlets are often faster than
the utility's own site, so treat them as real sources, not fallbacks.

| Adapter          | What it is                           | Notes                                                                                                |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `yeniduzen`      | News outlet                          | Has a feed                                                                                           |
| `kibrispostasi`  | News outlet                          | Has a feed                                                                                           |
| `detaykibris`    | News outlet                          | HTML parse                                                                                           |
| `gundemkibris`   | News outlet                          | HTML parse. Often carries the fullest place lists — worth weighting when merging conflicting `areas` |
| `kibrisgazetesi` | News outlet                          | HTML parse                                                                                           |

Every adapter tags what it produces with a `SourceRef` carrying
`kind: 'official'` for the utility and `kind: 'press'` for outlets. No adapter
produces `official` today: the utility's own “Planlı Kesintiler” category is empty
and its feed carries tenders and technical specifications, so that adapter was
dropped after spending a request a run on nothing. The distinction stays,
because merging prefers an official reading where one exists and because a feed
from the utility is the one thing that would improve this pipeline outright.
KIB-TEK is still the number to call and the definitive word on an outage — it
is simply not a source this can read.

With five adapters, a single outage typically arrives four or five times.
Deduplication (§10.5) is what keeps that from becoming four cards for one event,
so verify it after adding **each** adapter, not once at the end.

**Outlets assert copyright over their article text.** This is why the pipeline
extracts structured facts only — times, dates, place names, outage kind — and
links back rather than storing prose (§10.3). Displaying the originating
organisation's name in the card footer is part of that arrangement, not just a
trust signal.

**Facebook is out of scope and must not be attempted.** Scraping it requires
either an access token the project cannot obtain or an authenticated headless
session that violates the platform's terms. A public civic service does not
build on that. If a future adapter is needed, the path is asking the utility
directly for a feed — not circumventing a login.

### 10.2 Adapter interface

Each adapter is independent and returns raw announcements. It does no parsing of
dates or places.

```ts
export type RawAnnouncement = {
  source: SourceRef;
  title: string;
  body: string;
  publishedAt: string; // ISO 8601
  fetchedAt: string; // ISO 8601
};

export type SourceAdapter = {
  id: string;
  fetch(): Promise<RawAnnouncement[]>;
};
```

**One failing adapter must never stop the run.** Wrap each in its own try/catch,
log the failure with the adapter id, and continue with the rest. A run that
returns partial results is a success; a run that throws is an outage of its own.

### 10.3 Fetching etiquette

This project is public and takes public data. Behave accordingly.

- Poll every 10 minutes. Nothing here changes faster than that.
- Set a descriptive `User-Agent` that names the project and carries a contact
  address.
- Respect `robots.txt`.
- Send conditional requests (`If-None-Match` / `If-Modified-Since`) and skip
  unchanged responses.
- Cap concurrency at one request per host at a time, with a short delay between
  requests.
- Retry with exponential backoff, at most three attempts, then give up until the
  next run.
- **Extract structured facts only** — times, dates, place names, outage kind.
  Never store or republish an outlet's article text. Link to the original
  instead. This keeps the project clear of copyright issues and out of the
  duplicate-content trap that would sink it in search results anyway.

### 10.4 Parsing

**One model reads every announcement. There is no rules stage.**

There was one, and it was written on a true observation: announcement prose is
highly formulaic, and a typical sentence names a reason, a time range and a list
of villages. Regexes handled those well. They handled nothing else, and the
proportion of "nothing else" was never small — it was simply invisible, because
what the rules could not read went to a review queue nobody was reading.

The measurement that settled it: of the first 82 stored records, 78 were planned
outages and 2 were faults. Not because faults are rare. Because planned work is
announced in a form with a clock in it, and a fault is written as a sentence —
"bir iş aracının orta gerilim hatlarına çarpması sonucu elektrik verilemiyor",
which names four villages, gives no time, and describes a real outage in
progress. No pattern list reaches that, and every attempt to extend one toward
it made the rules more fragile on the announcements they already handled.

**What the model is asked for.** One article per request, with Structured
Outputs (`json_schema`, `strict: true`) so the shape is a constraint rather
than a request. Per outage: kind, local date, start and end as wall clocks,
areas as the announcement itself spells them, and two booleans — whether this
retracts an earlier announcement, and whether the outage is described as still
happening. Batching several articles into one prompt is not done: it lets one
malformed article spoil the reading of the others, and the volume does not need
it.

**What is deliberately not the model's job.** Everything downstream of the
reading is ours, because these are the places where being wrong is expensive and
being deterministic is cheap:

- _Places_: the model returns the announcement's own spellings; `matchPlaces`
  resolves them against `data/places.json`. The district is therefore derived
  from our table and never from something the model asserted, and `areas` always
  holds canonical names — which is what lets a lamp on the map match a record at
  all (§3.2). A name the model invents matches nothing and is left out rather
  than reaching the database as a place that does not exist.
- _Time zones_: the model returns a local date and a wall clock; the conversion
  to UTC goes through the same function the site reads back with.
- _Identity_: the fingerprint (§10.5), so a re-run is idempotent whatever the
  model returns.
- _Validation_: Structured Outputs guarantees the shape, not the contents. The
  schema cannot say "HH:MM" or "a real day in the calendar", and this is the
  boundary between somebody else's service and our database. A field that fails
  validation drops its entry.

**The one value not read off the page.** A fault already in progress has no
announced start, so the announcement's own publication time stands in for one
and `endsAt` is null. It errs late rather than early — a fault is reported once
it is already being felt, so the map never claims an outage before anyone had
one — and the record is marked `confidence: 'low'` to say so. Only a fault, and
only one the model reports as ongoing. Planned work with no hours is a failed
reading, not an open-ended outage.

**Cost, and why this is affordable.** The expensive mistake here would be paying
to read the same article repeatedly. Two things prevent it:

- `looksLikeOutage` still runs, in the **adapters**, on the article body before
  an announcement is emitted (§10.1). It is a crawl filter, not a parser — the
  outlets publish tenders, tariffs and football through the same listings, and
  there is no reason to pay to be told so. Measured across all five outlets, a
  run carries about 2 announcements rather than the 60 the caps allow.
- A `seen_articles` table keyed by URL, with a hash of the text beside it. The
  adapters look three days back and the ingest runs every ten minutes, so the
  same article arrives hundreds of times; it is read once. The hash is over the
  text rather than the URL because outlets rewrite announcements in place, and a
  rewritten one is new information. A failed reading is retried a few times and
  then left alone, so a transient API failure gets another go while an article
  the model cannot make sense of is not re-sent forever.

**When the model cannot be reached at all**, the announcement fails and goes to
the review queue with its raw text and the reason. Nothing is ever silently
dropped — that property is what makes depending on a single parser safe, and it
matters more now than it did when there was a second stage behind the first.

### 10.5 Identity and deduplication

The same outage arrives from several sources. Collapse rather than duplicate.

- Derive a **fingerprint** from `startsAt` + `endsAt` + the sorted set of
  normalised place names. Do not include the source or the wording — those are
  exactly what differ between duplicates.
- The record `id` is a stable hash of that fingerprint, so re-running the ingest
  is idempotent.
- On a match, merge: append the new `SourceRef` to `sources`, keep the earliest
  `publishedAt`, and prefer `kind: 'official'` field values over press ones when
  they conflict.
- **Place lists differ in completeness between outlets.** One will list every
  affected village, another will abbreviate. On merge, take the **union** of
  `areas` rather than the first or the official version — a reader whose village
  appears in only one outlet's list still needs to see it.
- Because outlets abbreviate, the fingerprint must tolerate partial place sets:
  when time ranges match exactly and one place set is a subset of the other,
  treat them as the same event and merge.
- Treat near-identical time ranges as the same event when they differ by less
  than fifteen minutes and the place sets overlap — outlets round times.
- **Two open-ended faults get a much wider window: six hours.** Their starts are
  not announced times that outlets rounded, they are the stand-in above, and
  outlets pick a fault up across an afternoon — so the same broken line arrives
  with starts hours apart and the fifteen-minute rule files it as four or five
  separate outages. The wide window applies only where both records are
  open-ended faults in the same district with overlapping places. Two genuinely
  separate faults in the same villages within six hours would merge; that is the
  rarer error, and one card that starts slightly early beats five for one event.
- When two open-ended faults merge, the **earliest** start wins outright — ahead
  of the official-source rule that settles the other fields. Being the utility's
  own announcement says nothing about when a fault began; it confirms one after
  the outlets have already run it. Letting it win also made the merge
  asymmetric, and the order records merge in is a hash, not a chronology.

### 10.6 Corrections and cancellations

Announcements get amended, and this is where naive scrapers mislead people.

- An announcement whose text signals cancellation must **retract** the matching
  record rather than adding a new one. Retracted records disappear from active
  and upcoming views but remain in the archive marked as cancelled.
- If a later announcement changes the times for a matching fingerprint, update
  the record and refresh `ingestedAt`.
- Never delete rows. Corrections are updates; history stays intact, because the
  archive's value depends on it. The schema grants the service role no delete,
  so this holds even when a script asks for one.
- A record the ingest **invented** is retired by cancelling it with a reason
  that says so (`bad_data`), never with the one meant for work the utility
  called off (`retracted`). Both drop out of the live views, but they say
  different things: telling a reader an outage was announced and cancelled when
  neither happened is its own wrong fact.

**Auditing the archive.** A parser fix does not reach records already stored. A
record keeps whatever the parser said on the day it was ingested, and the date
is part of the fingerprint, so a wrong date is a whole extra row rather than a
field to correct. After any change to the parser, and before trusting what the
archive says, re-check it against its own sources: refetch each record's
sources, re-derive them through today's parser, and report every record the
sources no longer support. The check is read-only; retiring is a separate step
with its own confirmation.

- **A wrong record and an overtaken one are not the same finding.** Where a
  source now claims a publication time later than the record's `ingestedAt`,
  the page has been rewritten since that record was parsed from it, and today's
  text is no evidence at all about the record. Report those apart from the rest
  and **never offer their ids for retirement** — deciding between two readings
  of a rewritten announcement is a judgement about what the utility actually
  announced, and it belongs to a person. Conflating the two once retired a
  correct record and left the wrong one it duplicated live on the homepage.

### 10.7 Observability

- Log every run as a row in `ingest_runs` (§8.1): adapters attempted, records
  created, updated, deduplicated, sent to review, and adapters that failed.
- The last successful run timestamp comes from that table and is what the status
  bar's "last checked" line reads.
- **If the last successful run is older than an hour, say so in the UI.** Stale
  data presented as current is worse than an honest gap. The frontend shows the
  last known state with its timestamp and a plain note that updates are delayed.

### 10.8 Backfill

Write a one-off script that walks each outlet's outage tag archive and ingests
historical announcements through the same parser. Six months of history makes
the archive and the twelve-month chart meaningful from launch instead of a year
from now — and that archive is the thing nobody else has.

---

## 11. Advertising

The site is free and ad-supported. Ads pay for the server and nothing more —
at local traffic rates this covers costs, not salaries. Design accordingly: an
aggressive ad layout would earn a rounding error and cost the trust the whole
project depends on.

### 11.1 The rule that overrides the rest

**No ad may ever sit between a person and the answer they came for.**

Someone opening this site during an outage, on a dying phone battery, must see
the status bar, the headline, and their district's card without scrolling past
an ad, waiting for one to load, or dismissing one. If a placement conflicts with
that, the placement loses.

Concretely, this forbids: anything above or overlapping the headline or map,
interstitials, pop-ups, sticky overlays that cover content, auto-refreshing
units, and any ad inside or adjacent to the countdown.

### 11.2 Getting approved

Ad networks reject tool-only sites as thin content, and the outage view is a
thin page by their measure — a few cards and a map. The guides (§5.4) and the
archive are what make the site substantive.

Do not apply for an ad account until: the guides are published in both locales,
the archive holds real historical records, and `about`, `privacy`, and `terms`
are live and truthful. Applying early and being rejected costs weeks.

The site must also be genuinely useful _before_ ads are added. Ship, get real
users, then monetise.

### 11.3 Placements

Three slots, all below the fold, all in-content:

| Slot               | Location                                                | Notes                              |
| ------------------ | ------------------------------------------------------- | ---------------------------------- |
| `home-mid`         | Home, after the first block of outage cards             | Never before the first card        |
| `district-mid`     | District page, between "upcoming" and the history chart | Never between "now" and "upcoming" |
| `guide-in-article` | Guide pages, after the first section                    | One per page                       |

The archive page carries at most one unit, near the bottom. Error states, empty
states, and any view showing a stale-data warning (§10.7) carry **none** —
those are moments where the person is already poorly served.

### 11.4 Implementation

- Load the ad script with `next/script` at `strategy="lazyOnload"`. It must
  never block first paint, hydration, or the map render.
- **Reserve the slot's height in CSS before the ad loads.** Zero layout shift.
  A card moving under someone's thumb as they tap is the exact failure this
  spec has been avoiding everywhere else.
- If the network fails or is blocked, the reserved space collapses cleanly. No
  broken frame, no placeholder text, no "please disable your ad blocker".
- Ads are a single `<AdSlot slot="home-mid" />` component. No ad markup is
  duplicated across pages.
- Ad slots do not render at all when `USE_MOCKS=true`, so development and
  screenshots stay clean.

### 11.5 Visual integration

Ads sit inside the design, not on top of it. The unit is wrapped in a container
matching the site's card treatment: 1px `--color-dark` border, same corner
radius, same horizontal rhythm. Above it, a small mono label in `--color-muted`
reading the "advertisement" string from the dictionary.

That label is required. It is honest, it is a policy requirement in most
jurisdictions, and on a dark, restrained layout an unlabelled ad reads as if the
site itself is endorsing whatever it shows.

Never style an ad to resemble an outage card. A person scanning for their
village must never mistake an ad for information.

### 11.6 Consent and privacy

- Show a consent banner before any advertising or analytics cookie is set, with
  an equally prominent "reject" option. Rejecting must be one click, not a
  buried settings panel.
- Store the choice and honour it. Re-prompting a person who declined is both
  hostile and, in much of Europe, non-compliant.
- The banner sits at the **bottom** of the viewport and never covers the status
  bar or headline. §11.1 applies to consent UI too.
- Non-personalised ads serve when consent is refused. The site still works
  completely.
- The privacy page (§5.5) lists what is set, by whom, and for how long.

### 11.7 What not to do

Local traffic makes each impression worth very little, and the temptation is to
compensate with volume. Resist it — the failure mode is a site people stop
trusting during the one hour a year they need it most.

- No ads on the map, in the status bar, or in the card grid's first row
- No auto-playing video or audio, ever
- No more than one unit per viewport height
- No ads on pages showing an error or a staleness warning
- No dark patterns in the consent flow: no pre-ticked boxes, no "reject" hidden
  behind a second screen, no cookie wall
- No clicking your own ads, and no wording that encourages clicks
- No selling or exposing the outage dataset to advertisers

### 11.8 A better long-term option

At local rates, network ads on a site like this cover hosting and little else.
Direct sponsorship from local businesses — a generator dealer, a solar
installer, an electrician — is typically worth several times more per impression
in a market this size, and a single well-matched sponsor is less intrusive than
a network unit.

Build the ad slot as a component that can render either a network unit or a
static sponsor card from local config. That flexibility costs nothing now and
opens the option later.

---

## 12. Explicitly avoid

- Gradients, glassmorphism, blurred panels, stacked shadows
- Emoji icons
- Scroll-triggered reveals, or any second animated element competing with the map
- Decorative numbering such as `01 / 02 / 03` — the content is not a sequence
- Permanent text labels printed across the map
- Fabricated reference numbers, or anything that mimics an official document ID.
  The site compiles public announcements; it must not dress itself up as the
  issuing authority.
- localStorage for filter state — use the URL
- Turkish identifiers anywhere in code, and hardcoded user-facing strings
  anywhere outside the locale dictionaries
- Flag icons for the language switcher — use language names
- Translating or transliterating place names (§7.3)
- Concatenating translated fragments with numbers or dates by hand — go through
  the dictionary and `Intl`
- A client-side i18n runtime library for two locales
- Auto-switching locale on every visit based on the header once the person has
  made an explicit choice
- Scraping Facebook or any authenticated surface (§10.1)
- Storing or republishing outlet article text — extract facts, link to the source
- Letting one failing adapter abort the whole ingest run
- `toLowerCase()` on Turkish place names — use locale-aware normalisation
- Deleting rows on correction — update instead, the archive is the asset
- Serving stale data without saying it is stale (§10.7)
- Putting the ingest inside a Next.js route handler — it is a cron script
- The service role key anywhere outside `ingest/` — never in `NEXT_PUBLIC_*`,
  never in a component or route handler
- Querying Supabase from a component — everything goes through `lib/db.ts`
- Tables without RLS enabled, or any write grant to `anon`
- Creating or altering schema in the Supabase dashboard instead of a migration
- Running the ingest against the hosted project while iterating — use
  `supabase start`
- Any ad above the fold, overlapping the map, or adjacent to the countdown
- Ad markup duplicated across pages instead of going through `AdSlot`
- Ad units that shift layout when they load — reserve the height
- Ads styled to resemble outage cards, or left unlabelled
- Consent banners that cover the status bar or headline, or that re-prompt after
  a refusal

---

## 13. Build order

Three phases, in order. **Finish each before starting the next.** The frontend
is verified by eye, the ingest by running it against live pages, the content and
ad layer only once real people are using the site — different kinds of work, and
interleaving them produces three half-finished thirds.

### Phase A — frontend against mocks

1. Types, mock data, the `lib/data.ts` seam, time utilities, and the i18n
   scaffold: `config.ts`, both dictionaries, the locale layout, and the
   middleware. Set this up first — retrofitting locales after the components
   exist means touching every file twice.
2. `OutageCard` + `KindBadge` + `Countdown`, statically rendered on the home
   page. **Verify density here before moving on** — this is where the first pass
   went wrong. Check the card in both locales at this point, since English
   strings run longer.
3. `IslandMap`: geometry and projection first, static, no animation. Confirm the
   island is recognizable and every point sits on land.
   **Stop here for a visual check.**
4. Point states, interaction, accessibility.
5. The ignition sequence, plus the reduced-motion path.
6. District page, including the mini map variant.
7. `HistoryChart`.
8. Archive page.
9. `LocaleSwitcher`, `hreflang` tags, and per-locale metadata.
10. Responsive pass at 360 / 768 / 1280 **in both locales**, then the
    accessibility pass.

### Phase B — ingest

11. Supabase project and the first migration (§8.1): tables, enums, indexes, RLS
    policies. Verify with the anon key that reads work and writes are refused.
12. `data/places.json`: every settlement with district and aliases. Tedious and
    unavoidable — parsing quality is capped by this file, so do it properly
    before writing any parser.
13. Parsers as pure functions with unit tests, fed by fixture strings copied from
    real announcements. No network yet. **Test the Turkish case-folding edge
    cases explicitly.**
14. The `kibtek` adapter alone, plus `dedupe.ts` and `store.ts`. Run end to end
    against a local Supabase, inspect the rows by hand.
    **Stop here and compare the parsed rows against the live announcements.**
15. The remaining adapters, one at a time. **After each one, re-run and confirm
    the count of records did not grow** — if it did, dedupe is failing and
    adding another adapter will only compound it.
16. The LLM fallback and the review queue.
17. Point `lib/data.ts` at Supabase, flip `USE_MOCKS=false`, and confirm the
    real records render correctly in both locales.
18. Staleness handling in the status bar (§10.7), then `ingest_runs` logging.
19. The backfill script (§10.8).

### Phase C — content and monetisation

Only after the site is live, running on real data, and being used. Ads on a site
nobody visits earn nothing and cost the approval attempt.

20. `about`, `privacy`, `terms` in both locales (§5.5). Written honestly, not
    generated boilerplate.
21. The guides section and the launch set of articles (§5.4), both locales.
    This is the single biggest factor in ad-network approval.
22. `ConsentBanner`, plus the storage and honouring of the choice (§11.6).
23. `AdSlot` with reserved height and graceful failure, rendering nothing while
    `USE_MOCKS=true` (§11.4). Verify zero layout shift on a throttled connection.
24. Apply for the ad account. Only now.
25. Enable slots one at a time, checking §11.1 on a real phone after each: can
    someone still see their district's status without passing an ad?

Write a short plan — component tree and file list — before starting each phase.
