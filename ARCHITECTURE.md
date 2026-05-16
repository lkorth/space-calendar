# Space Calendar — Architecture

## Overview

A single subscribable ICS feed where users select which event categories they want. Static astronomical data is pre-generated annually and stored in the repo. Live launch data is fetched from an external API and cached. A Cloudflare Worker merges the two at request time and serves a filtered ICS feed.

```
┌─────────────────────────────────────────────────────────────┐
│                        GitHub Repo                          │
│                                                             │
│  data/          ← generated JSON, committed once/year       │
│  src/worker/    ← Cloudflare Worker source                  │
│  src/site/      ← configurator UI (GitHub Pages)            │
│  history.yaml   ← curated space history events              │
│  comets.yaml    ← manually curated notable comets           │
│  .github/       ← Actions workflows                         │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
     push to main                  annual schedule
             │                       (Jan 1 + manual)
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
│  │  ?c=launches,    │        │  static:eclipses       │     │
│  │    eclipses,     │        │  static:meteor-showers │     │
│  │    moon-phases   │        │  static:oppositions    │     │
│  │                  │        │  static:elongations    │     │
│  │  merges selected │        │  static:asteroids      │     │
│  │  categories into │        │  static:history        │     │
│  │  one ICS feed    │        │  static:comets         │     │
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
| `generate-annual.yml` | January 1 + manual | Moon phases, eclipses, solstices/equinoxes, meteor showers, oppositions, elongations, history milestones |
| `generate-monthly.yml` | 1st of each month | Asteroid close approaches |
| `generate-weekly.yml` | Weekly (Sunday) | Comets |
| `generate-on-change.yml` | Push to main (YAML changed) | History (if `history.yaml` changed), Comets (if `comets.yaml` changed) |

**API sources:**
- [USNO Astronomical Applications API](https://aa.usno.navy.mil/data/api) — moon phases, solar/lunar eclipses, solstices, equinoxes, planetary oppositions, elongations
- [JPL CNEOS close approach API](https://ssd-api.jpl.nasa.gov/cad.api) — notable asteroid close approaches
- [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html) — comet data
- American Meteor Society annual calendar — fetched and parsed (changes rarely)

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
| `static:<category>` | Generated annually by GitHub Actions | No expiry — overwritten each year |
| `launches` | Launch Library 2 API | 1 hour |
| `aurora:<lat>` | NOAA SWPC 3-day Kp forecast | 3–4 hours |

Aurora keys are keyed by whole-number latitude (e.g., `aurora:45`, `aurora:52`), so all subscribers within the same latitude degree share a single cached forecast. This limits the total number of aurora cache entries to ~40 for all of North America (25°N–65°N).

### 3. Cloudflare Worker

Handles `GET /feed.ics?c=<categories>&lat=<latitude>`.

- Parses the `c` query parameter as a comma-separated list of category slugs
- Reads each requested static category from KV
- If `launches` is requested: reads from KV; on cache miss, fetches from Launch Library 2, filters to notable launches, writes to KV with 1-hour TTL
- If `aurora` is requested: rounds `lat` to the nearest integer, reads `aurora:<lat>` from KV; on cache miss, fetches NOAA SWPC 3-day Kp forecast, computes visibility windows for that latitude, writes to KV with 3–4 hour TTL
- Merges all events into a single ICS document and streams it to the client
- Sets `Content-Type: text/calendar` and `Cache-Control: max-age=3600`

**Category slugs:**

| Slug | Description |
|------|-------------|
| `moon-phases` | New, full, and quarter moons |
| `meteor-showers` | Peak nights |
| `eclipses-solar` | Solar eclipses |
| `eclipses-lunar` | Lunar eclipses |
| `solstices-equinoxes` | Seasonal events |
| `oppositions` | Planetary oppositions |
| `elongations` | Mercury & Venus elongations |
| `asteroids` | Notable close approaches |
| `comets` | Perihelion, closest approach, visibility windows |
| `launches` | Notable rocket launches (live data) |
| `history` | Space history milestone anniversaries |
| `aurora` | Aurora borealis forecasts — requires `&lat=<whole_degree>` |

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
| Moon phases, eclipses, planetary events | Annually (Jan 1) | KV + repo | Worker (from KV) |
| Meteor showers | Manually, rarely | KV + repo | Worker (from KV) |
| Space history milestones | Annually (computed from history.yaml) | KV + repo | Worker (from KV) |
| Comets | Manually as needed | KV + repo | Worker (from KV) |
| Rocket launches | Hourly (TTL) | KV only | Worker (from KV, fetched from LL2) |
| Aurora forecasts | Every 3–4 hours (TTL) | KV only | Worker (from KV, fetched from NOAA SWPC) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Source control & CI | GitHub + GitHub Actions |
| Static site (configurator) | GitHub Pages |
| Edge compute | Cloudflare Workers |
| Key-value store | Cloudflare Workers KV |
| Launch data | The Space Devs Launch Library 2 |
| Astronomical data | USNO API |
| Asteroid & comet data | JPL CNEOS + SBDB APIs |
| Aurora forecast data | NOAA SWPC API |

---

## Subscription URL Format

```
webcal://space-calendar.workers.dev/feed.ics?c=moon-phases,launches,eclipses-solar
webcal://space-calendar.workers.dev/feed.ics?c=moon-phases,aurora,launches&lat=45
```

Users generate this URL from the configurator page. The URL is stable and re-subscribable — changing categories means getting a new URL from the configurator.
