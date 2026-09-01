# Space Calendar — Architecture

## Overview

A single subscribable ICS feed where users select which event categories they want. Static astronomical data is pre-generated on a rolling schedule and stored in the repo. Live launch and aurora data is fetched from external APIs and cached. A Cloudflare Worker merges the two at request time and serves a filtered ICS feed.

```
┌─────────────────────────────────────────────────────────────┐
│                        GitHub Repo                          │
│                                                             │
│  data/          ← generated JSON, committed on schedule      │
│  src/worker/    ← Cloudflare Worker source                  │
│  src/site/      ← configurator UI (GitHub Pages)            │
│  history.yaml   ← curated space history events              │
│  comets.yaml    ← manually curated notable comets           │
│  .github/       ← Actions workflows                         │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
     push to main              scheduled (see below)
             │                          (+ manual)
             ▼                            ▼
┌────────────────────┐      ┌─────────────────────────────┐
│   GitHub Actions   │      │      GitHub Actions         │
│   (deploy worker)  │      │     (data generation)       │
└────────┬───────────┘      │                             │
         │                  │  USNO API → moon phases,    │
         │                  │  eclipses, solstices,       │
         │                  │  elongations, oppositions   │
         │                  │                             │
         │                  │  JPL API → asteroid flybys  │
         │                  │                             │
         │                  │  AMS data → meteor showers  │
         │                  │  (static, curated annually) │
         │                  │                             │
         │                  │  history.yaml → milestone   │
         │                  │  anniversaries this year    │
         │                  └──────────────┬──────────────┘
         │                                 │
         │                         commit data/ JSON
         │                         + push KV via Wrangler
         ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare                               │
│                                                             │
│  ┌──────────────────┐        ┌────────────────────────┐     │
│  │  Worker          │        │  KV Store              │     │
│  │                  │◄──────►│                        │     │
│  │  GET /feed.ics   │        │  static:moon-phases    │     │
│  │  GET /feed.json  │        │  static:eclipses       │     │
│  │  ?c=launches,    │        │  static:meteor-showers │     │
│  │    eclipses,     │        │  static:oppositions    │     │
│  │    moon-phases   │        │  static:elongations    │     │
│  │                  │        │  static:asteroids      │     │
│  │  merges selected │        │  static:history        │     │
│  │  categories into │        │  static:comets         │     │
│  │  ICS or JSON     │        │                        │     │
│  │                  │        │                        │     │
│  │                  │        │  launches (TTL: 1hr)   │     │
│  │                  │        │  aurora:<lat>          │     │
│  │                  │        │    (TTL: 3–4hr)        │     │
│  └────────┬─────────┘        └────────────────────────┘     │
│           │                                                 │
│           │ cache miss on launches or aurora                │
│           ▼                                                 │
│  Launch Library 2 API → launches KV → serve                 │
│  NOAA SWPC API → aurora:<lat> KV → serve                    │
└─────────────────────────────────────────────────────────────┘
             │
             ▼
   subscriber's calendar app
   (Google Calendar, Apple Calendar, Outlook)
   webcal://space-calendar.workers.dev/feed.ics?c=...
```

---

## Components

### 1. Static Data Generation (GitHub Actions)

No astronomical calculations are performed — all data is consumed from public APIs and curated YAML files. Four workflows run on different schedules matching how often each data source changes:

| Workflow | Schedule | Generators |
|----------|----------|------------|
| `generate-monthly.yml` | 1st of each month | Moon phases, eclipses, solstices/equinoxes, meteor showers, oppositions, elongations, conjunctions, alignments, occultations, deep sky, history milestones |
| `generate-weekly.yml` | Weekly (Sunday) | Asteroid close approaches, comets |
| `generate-on-change.yml` | Push to main (YAML changed) | History (if `history.yaml` changed), Comets (if `comets.yaml` changed) |

**Rolling data window:** Every pipeline run produces a rolling window of events — 6 months in the past through 1 year in the future — rather than a fixed calendar year. Generators are called for each calendar year that overlaps the window and results are merged, deduplicated by UID, and filtered to the window before writing to `data/`. The same 6-month lookback is applied when filtering live category results (astronomy clubs) before caching.

**API sources:**
- [USNO Astronomical Applications API](https://aa.usno.navy.mil/data/api) — moon phases, solar eclipses, solstices, equinoxes (lunar eclipse and planetary phenomena endpoints do not exist in USNO's API)
- [NASA Five Millennium Lunar Eclipse Catalog](https://eclipse.gsfc.nasa.gov/5MCLE/5MKLEcatalog.txt) — lunar eclipses; parsed from the plain-text catalog file, P1/P4 computed from penumbral duration
- [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) — planetary oppositions and Mercury/Venus elongations; daily ephemeris queried per planet, local maxima in elongation angle used to find event dates
- [JPL CNEOS close approach API](https://ssd-api.jpl.nasa.gov/cad.api) — notable asteroid close approaches
- [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html) — comet orbital data
- American Meteor Society annual calendar — static curated data, updated manually when AMS revises it

**Curated YAML files:**
- `history.yaml` — spaceflight history events; generator computes which milestone anniversaries (20/25/50/75/100 years) fall in the current year
- `comets.yaml` — manually maintained list of notable comets; generator fetches updated data from JPL for each listed comet

Outputs: one JSON file per category written to `data/`, then:
1. Committed to the repo (meaningful, infrequent commits)
2. Written to Cloudflare KV via Wrangler so the worker can read them without fetching from GitHub on every request

**Pipeline language: TypeScript** (same as the worker — shared types, no separate runtime required)

### 2. Cloudflare KV Store

Three types of entries:

| Key pattern | Source | TTL |
|-------------|--------|-----|
| `static:<category>` | Generated on pipeline schedule by GitHub Actions | No expiry — overwritten on each run |
| `launches` | Launch Library 2 API | 1 hour |
| `aurora:<lat>` | NOAA SWPC 3-day Kp forecast | 3–4 hours |
| `astronomy-clubs:<id>` | Club website / iCal feed | 6 hours |

Aurora keys are keyed by whole-number latitude (e.g., `aurora:45`, `aurora:52`), so all subscribers within the same latitude degree share a single cached forecast. This limits the total number of aurora cache entries to ~40 for all of North America (25°N–65°N).

### 3. Cloudflare Worker

Handles `GET /feed.ics?c=<categories>&lat=<latitude>` and `GET /feed.json` with identical parameters.

- Parses the `c` query parameter as a comma-separated list of category slugs (see **Request parameter handling** below)
- Reads each requested static category from KV
- If `launches` is requested: reads from KV; on cache miss, fetches from Launch Library 2, filters to notable launches, writes to KV with 1-hour TTL
- If `aurora` is requested: rounds `lat` to the nearest integer, reads `aurora:<lat>` from KV; on cache miss, fetches NOAA SWPC 3-day Kp forecast, computes visibility windows for that latitude, writes to KV with 3–4 hour TTL
- Merges all events, then either:
  - `/feed.ics` — serializes to an ICS document (`Content-Type: text/calendar`)
  - `/feed.json` — returns `{ name, events }` as JSON (`Content-Type: application/json`)
- Sets `Cache-Control: max-age=3600` and a strong `ETag` (SHA-256 of the response body, truncated to 128 bits) on both endpoints, and answers a matching `If-None-Match` with `304 Not Modified`. Some subscribers poll far more often than `max-age` allows — one client in production refetches every ~10 minutes — so the conditional request is what actually keeps repeat polling cheap.
- `DTSTAMP` is truncated to the start of the UTC day so the serialized body stays byte-identical while content is unchanged, which is what makes the ETag matchable. The period is deliberately much longer than `max-age`: every boundary crossing rewrites `DTSTAMP` and invalidates the ETag with no content change behind it, and at an hour-or-shorter period a client revalidating on `max-age` expiry crosses a boundary every time and never gets a 304. Content changes are carried by the ETag, not `DTSTAMP`, so a mid-day revision still invalidates the cache within the hour.

**Request parameter handling:**

Subscription URLs live in calendar clients indefinitely and cannot be edited by us, so the
parser (`src/worker/params.ts`) is deliberately tolerant of URLs we would not generate today:

| Input | Handling |
|-------|----------|
| Legacy group slugs `sky-events`, `planetary` | Expanded to their replacement slugs via `LEGACY_CATEGORY_ALIASES`, then deduplicated against any explicitly listed members |
| Unknown slugs | Ignored; the rest of the feed is still served |
| Double-encoded query tails (`c=moon-phases%26tz%3D...`) | The swallowed `key=value` pairs are split back out and merged in; an explicitly supplied parameter always wins. Seen on links rewritten by ChatGPT |
| Repeated `?c=` parameters | Concatenated rather than dropped |
| `hemi` | Accepts `s`, `south`, `southern`, any case; anything else is northern |
| Non-numeric `lat` | Treated as absent rather than `NaN`, which would otherwise fail the latitude/hemisphere cross-check and 400 a working subscription |
| Fixed-offset `tz` (`Etc/GMT-2`, `UTC+2`, `+02:00`) | Canonicalized to the equivalent `Etc/GMT±N` zone and served as given. These carry no DST rules, so a subscriber whose region observes DST sees contact times drift by an hour for half the year — but the real zone cannot be recovered from an offset (`Etc/GMT-2` is equally consistent with Europe/Kyiv year-round and Europe/Warsaw in July), so guessing would be wrong in the other direction. Logged with `console.warn` so the affected population stays visible in Workers observability |
| `utm_source` and other unknown parameters | Ignored by the parser, but preserved in the URL. The configurator copies `utm_source` from its own landing URL into the subscription URL it generates, so a campaign shows up in Workers logs on every subsequent fetch — measuring who actually subscribed and kept syncing, not just who clicked. The tag does not change the response body (identical ETag), so its only cost is a separate edge-cache entry per campaign |
| Unparseable `tz` | Dropped, so contact times fall back to UTC. Previously this reached `tzOffsetHours` as an unvalidated string and silently resolved to longitude 0° for the Milky Way and deep-sky windows |

**Category slugs:**

| Slug | Description |
|------|-------------|
| `moon-phases` | New and full moons |
| `meteor-showers` | Peak nights |
| `eclipses-solar` | Solar eclipses |
| `eclipses-lunar` | Lunar eclipses |
| `solstices-equinoxes` | Seasonal events |
| `oppositions` | Planetary oppositions |
| `elongations` | Mercury & Venus elongations |
| `asteroids` | Notable close approaches |
| `comets` | Perihelion, closest approach, visibility windows |
| `conjunctions` | Planetary conjunctions |
| `alignments` | Planetary alignments |
| `occultations` | Lunar occultations |
| `launches` | Notable rocket launches (live data) |
| `history` | Space history milestone anniversaries |
| `aurora` | Aurora borealis forecasts — requires `&lat=<whole_degree>` |
| `aurora-australis` | Aurora australis forecasts — requires `&lat=<negative_whole_degree>` |
| `milky-way` | Milky Way viewing windows |
| `deep-sky` | Deep sky object visibility |
| `mission-milestones` | Spacecraft mission milestones (live data) |
| `astronomy-clubs` | Club event calendars — requires `&club=<id>` |

Retired slugs still honored for existing subscriptions: `sky-events` → `moon-phases`, `meteor-showers`, `solstices-equinoxes`, `eclipses-solar`, `eclipses-lunar`; `planetary` → `oppositions`, `elongations`, `asteroids`, `comets`.

### 4. Configurator UI (GitHub Pages)

A single static HTML page served from `src/site/` via GitHub Pages.

- Checkbox for each category with a short description
- Aurora checkbox reveals a zip code / Canadian postal code input field with a note about calendar sync limitations
- Zip/FSA is looked up against a bundled latitude table (committed to the repo); the resolved whole-degree latitude is encoded into the URL as `&lat=<n>` — the raw zip is never sent to the worker
- Generates a `webcal://` subscription URL as the user toggles categories
- Copy-to-clipboard button
- "Add to Google Calendar" direct link
- No backend required — pure client-side

### 5. Curated Data Files

**`history.yaml`** — the source of truth for space history events. Each entry has the original event date, a title, and a written description. The annual GitHub Action reads this file and emits only the entries whose anniversaries fall in the current year at a milestone interval.

**`comets.yaml`** — manually maintained. When a notable comet is discovered or confirmed as naked-eye visible, a maintainer adds it here and triggers the data generation action.

---

## Data Flow Summary

| Data type | Updated | Stored | Served by |
|-----------|---------|--------|-----------|
| Moon phases, eclipses, planetary events | Monthly (rolling 6-month back / 1-year ahead window) | KV + repo | Worker (from KV) |
| Asteroid close approaches | Weekly (rolling window) | KV + repo | Worker (from KV) |
| Comets | Weekly + on YAML change (rolling window) | KV + repo | Worker (from KV) |
| Space history milestones | Monthly (computed from history.yaml, rolling window) | KV + repo | Worker (from KV) |
| Rocket launches | Hourly (TTL) | KV only | Worker (from KV, fetched from LL2) |
| Aurora forecasts | Every 3–4 hours (TTL) | KV only | Worker (from KV, fetched from NOAA SWPC) |
| Astronomy club events | Every 6 hours (TTL) | KV only | Worker (from KV, fetched from club website/iCal) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Source control & CI | GitHub + GitHub Actions |
| Static site (configurator) | GitHub Pages |
| Edge compute | Cloudflare Workers |
| Key-value store | Cloudflare Workers KV |
| Launch data | The Space Devs Launch Library 2 |
| Moon phases & solar eclipses | USNO API |
| Lunar eclipses | NASA Five Millennium Catalog |
| Planetary oppositions & elongations | JPL Horizons API |
| Asteroid & comet data | JPL CNEOS + SBDB APIs |
| Aurora forecast data | NOAA SWPC API |

---

## Subscription URL Format

```
webcal://space-calendar.workers.dev/feed.ics?c=moon-phases,launches,eclipses-solar
webcal://space-calendar.workers.dev/feed.ics?c=moon-phases,aurora,launches&lat=45
```

Users generate this URL from the configurator page. The URL is stable and re-subscribable — changing categories means getting a new URL from the configurator. For the full API parameter reference (including `/feed.json`), see the README.
