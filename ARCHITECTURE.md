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
         │                  │  JPL APIs → moon phases,    │
         │                  │  solstices, elongations,    │
         │                  │  oppositions, asteroids     │
         │                  │                             │
         │                  │  NASA catalogs → eclipses   │
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

Positions and catalogs come from public APIs and curated YAML files. The pipeline calculates only the moments that follow from positions, such as a moon phase or an opposition. Four workflows run on different schedules matching how often each data source changes:

| Workflow | Schedule | Generators |
|----------|----------|------------|
| `generate-monthly.yml` | 1st of each month | Moon phases, eclipses, solstices/equinoxes, meteor showers, oppositions, elongations, conjunctions, alignments, occultations, deep sky, history milestones |
| `generate-weekly.yml` | Weekly (Sunday) | Asteroid close approaches, comets |
| `generate-on-change.yml` | Push to main (YAML changed) | History (if `history.yaml` changed), Comets (if `comets.yaml` changed) |

**Rolling data window:** Every pipeline run produces a rolling window of events — 6 months in the past through 1 year in the future — rather than a fixed calendar year. Generators are called for each calendar year that overlaps the window and results are merged, deduplicated by UID, and filtered to the window before writing to `data/`. The same 6-month lookback is applied when filtering live category results (astronomy clubs) before caching, and Milky Way viewing windows are computed over the full rolling window so the next season is always in the feed — at 40°N, for example, the season ends in mid-August, and a calendar-year window would show nothing upcoming until January.

**API sources:**
- [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api), Sun and Moon positions — moon phases, solstices and equinoxes. `src/pipeline/clients/sun-moon.ts` reads the ecliptic longitudes every six hours and interpolates the moment of each phase and season, to the nearest minute. Each body and year is requested once per run
- [NASA Five Millennium Solar Eclipse Catalog](https://eclipse.gsfc.nasa.gov/5MCSE/5MKSEcatalog.txt) — solar eclipses. The date and type come from the plain-text catalog, with the time converted from Terrestrial Time to UT
- [NASA Five Millennium Lunar Eclipse Catalog](https://eclipse.gsfc.nasa.gov/5MCLE/5MKLEcatalog.txt) — lunar eclipses; parsed from the plain-text catalog file, greatest eclipse converted from Terrestrial Time to UT, P1/P4 computed from penumbral duration
- [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api), planet positions — planetary oppositions and Mercury/Venus elongations; daily ephemeris queried per planet, local maxima in elongation angle used to find event dates
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

**Wall calendar events:** The monthly run also writes `data/wall-calendar-events.json`: the moon phases, eclipses, seasons, meteor showers and oppositions of this calendar year and the next. A wall calendar needs a whole year, and the rolling window rarely holds one. The same generators make both files. To write only this file, run `npm run pipeline -- --wall-calendar`.

### 2. Cloudflare KV Store

| Key pattern | Source | TTL |
|-------------|--------|-----|
| `static:<category>` | Generated on pipeline schedule by GitHub Actions | No expiry — overwritten on each run |
| `static:wall-calendar-events` | Full calendar years for wall calendars, from the monthly pipeline | No expiry |
| `launches:<deploy>` | Launch Library 2 API | 1 hour |
| `mission-milestones:<deploy>` | Launch Library 2 events API | 1 hour |
| `aurora:<lat>:<deploy>` / `aurora-australis:<lat>:<deploy>` | NOAA SWPC 3-day Kp forecast | 3–4 hours |
| `milky-way:<lat>:<lon>:<deploy>` | Computed in the worker | 24 hours |
| `astronomy-clubs:<id>:<deploy>` | Club website / iCal feed | 6 hours |

Aurora keys are keyed by whole-number latitude (e.g., `aurora:45:<deploy>`, `aurora:52:<deploy>`), so all subscribers within the same latitude degree share a single cached forecast. This limits the total number of aurora cache entries to ~40 for all of North America (25°N–65°N).

`<deploy>` is the `DEPLOY_ID` var (short git SHA) set by `worker:deploy`. Every key the worker writes itself is suffixed with it, so a new deploy never reads events serialized by older code: changes to filtering or the event shape take effect immediately instead of after the old entries' TTL, and a format change can't break parsing. The first request after a deploy refetches from the upstream API; old entries expire via their TTL. `static:*` keys are written by the pipeline, not the worker, and are not versioned. The same `DEPLOY_ID` is also part of the edge-cache key.

`deploy-worker.yml` deploys after the Test workflow passes on `main`, but only if worker files changed since the commit of its last successful run. It compares the full range rather than the last commit, so a push of several commits, or a commit whose earlier tests or deploy failed, still ships. If it cannot find that commit, it deploys. A manual run always deploys.

After a deploy, `deploy-worker.yml` starts `e2e-tests.yml`, which tests the live worker. It is a separate workflow so that a failing test, which often means an outside service is unavailable, does not mark the deploy as failed and cause the next push to deploy again.

### 3. Cloudflare Worker

Handles `GET /feed.ics?c=<categories>&lat=<latitude>` and `GET /feed.json` with identical parameters.

- Parses the `c` query parameter as a comma-separated list of category slugs (see **Request parameter handling** below)
- Reads each requested static category from KV
- If `launches` is requested: reads from KV; on cache miss, fetches from Launch Library 2, filters to notable launches with at least month-level date precision, writes to KV with 1-hour TTL
- If `aurora` is requested: rounds `lat` to the nearest integer, reads `aurora:<lat>:<deploy>` from KV; on cache miss, fetches NOAA SWPC 3-day Kp forecast, computes visibility windows for that latitude, writes to KV with 3–4 hour TTL
- Merges all events, then either:
  - `/feed.ics` — serializes to an ICS document (`Content-Type: text/calendar`)
  - `/feed.json` — returns `{ name, events }` as JSON (`Content-Type: application/json`)
- Looks the request up in the Workers edge cache under a key rebuilt from the path, the parsed parameters (`c`, `lat`, `lon`, `tz`, `hemi`, and `club` only when `astronomy-clubs` is requested), and the deploy id. Nothing is copied from the raw URL, so tracking tags (`sid`, `utm_source`), cache busters, and unknown parameters never fragment the shared cache, and a deploy never serves a stale body. The key is an allowlist: a parameter missing from it would make subscribers with different values share one cached feed, so `CACHE_KEY_PARTS` in `src/worker/index.ts` is typed over every `RequestParams` field and a new field without an entry fails the type check
- Sets `Cache-Control: max-age=3600` and a strong `ETag` (SHA-256 of the response body, truncated to 128 bits) on both endpoints, and answers a matching `If-None-Match` with `304 Not Modified`. Some subscribers poll far more often than `max-age` allows — one client in production refetches every ~10 minutes — so the conditional request is what actually keeps repeat polling cheap.
- Writes one row per feed request to a Workers Analytics Engine dataset (`USAGE` binding, dataset `space_calendar_usage`, see `src/worker/usage.ts`): the `sid`, full URL, `utm_source`, user agent, the network (`asOrganization`, ASN) and city/region/country Cloudflare resolves the request to, and the outcome (status, whether it was conditional, whether it was an edge cache hit). Never the client IP. Written for every outcome including cache hits and 400s, so the count is of requests rather than of bodies built. Workers Logs are still on, but they keep seven days and redact any run of 32+ hex digits in the URL — which is exactly a UUID `sid` — so they cannot tell subscriptions apart or date them; Analytics Engine stores rows verbatim for three months. Columns are positional, so `USAGE_BLOBS`/`USAGE_DOUBLES` are append-only.
- `DTSTAMP` is truncated to the start of the UTC day so the serialized body stays byte-identical while content is unchanged, which is what makes the ETag matchable. The period is deliberately much longer than `max-age`: every boundary crossing rewrites `DTSTAMP` and invalidates the ETag with no content change behind it, and at an hour-or-shorter period a client revalidating on `max-age` expiry crosses a boundary every time and never gets a 304. Content changes are carried by the ETag, not `DTSTAMP`, so a mid-day revision still invalidates the cache within the hour.

**Request parameter handling:**

Subscription URLs live in calendar clients indefinitely and cannot be edited by us, so the
parser (`src/worker/params.ts`) is deliberately tolerant of URLs we would not generate today:

| Input | Handling |
|-------|----------|
| Legacy group slugs `sky-events`, `planetary` | Expanded to their replacement slugs via `LEGACY_CATEGORY_ALIASES`, then deduplicated against any explicitly listed members |
| Unknown slugs | Ignored; the rest of the feed is still served. A request with no known slug gets a 400, unless it names a retired one |
| Retired slugs (`RETIRED_CATEGORIES` in `src/shared/models.ts`) | Contribute no events. A subscription to nothing but retired slugs gets an empty calendar rather than a 400, because it was valid when it was made. The list is empty today |
| Double-encoded query tails (`c=moon-phases%26tz%3D...`) | The swallowed `key=value` pairs are split back out and merged in; an explicitly supplied parameter always wins. Seen on links rewritten by ChatGPT |
| Repeated `?c=` parameters | Concatenated rather than dropped |
| `hemi` | Accepts `s`, `south`, `southern`, any case; anything else is northern |
| Non-numeric `lat` | Treated as absent rather than `NaN`, which would otherwise fail the latitude/hemisphere cross-check and 400 a working subscription. Outside ±90 is treated as absent too |
| Unknown `club` | Treated as absent. The ids are matched exactly against `CLUBS` in `src/worker/categories/astronomy-clubs.ts` |
| `lon` | Rounded to a whole degree like `lat`, keeping the location in the URL coarse (~100 km). Non-numeric or outside ±180 is treated as absent. Only Milky Way uses it; when absent, longitude is estimated from the standard UTC offset of `tz` (offset × 15°), which is what every subscription generated before `lon` existed relies on. That estimate is the center of the timezone, so a subscriber near its edge sees windows shifted — Madrid at -4° is estimated at 15° (Central European Time), putting its windows ~76 minutes early |
| Fixed-offset `tz` (`Etc/GMT-2`, `UTC+2`, `+02:00`) | Canonicalized to the equivalent `Etc/GMT±N` zone and served as given. These carry no DST rules, so a subscriber whose region observes DST sees contact times drift by an hour for half the year — but the real zone cannot be recovered from an offset (`Etc/GMT-2` is equally consistent with Europe/Kyiv year-round and Europe/Warsaw in July), so guessing would be wrong in the other direction. Logged with `console.warn` so the affected population stays visible in Workers observability |
| `sid` | Ignored by the parser, but preserved in the URL. The configurator mints a UUIDv7 once per visit and writes it into the subscription URL it generates, so a calendar client replays the same id on every poll and distinct ids in the usage dataset count subscriptions rather than requests — without it, one client polling hourly is indistinguishable from a household behind a single IP. A v7 opens with the millisecond it was minted, so a log line also dates the subscription and how long it has been syncing, with no first-seen table to maintain. The rest is random and carries nothing about the visitor |
| `utm_source` and other unknown parameters | Ignored by the parser, but preserved in the URL. The configurator copies `utm_source` from its own landing URL into the subscription URL it generates, so a campaign shows up in the usage dataset on every subsequent fetch — measuring who actually subscribed and kept syncing, not just who clicked |
| `tz` in another case or an alias (`america/denver`, `US/Mountain`) | Resolved to the name `Intl` reports for the zone, so spellings of one zone share a cache entry |
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

**Wall calendar data** (`GET /wall-calendar.json`, see `src/worker/wall-calendar.ts`): passes `static:wall-calendar-events` through without parsing it. It is not written to the usage dataset, which counts feed subscriptions.

### 4. Configurator UI (Workers static assets)

A single static HTML page in `src/site/`, served as [static assets](https://developers.cloudflare.com/workers/static-assets/) by the same Worker, on the same domain as the feed.

Assets are matched *before* the Worker runs, so a page load never invokes it — those requests are free and unlimited — while `/feed.ics` and `/feed.json` match no asset and fall through to the Worker. `run_worker_first` is deliberately not set: enabling it would put page views in the Worker's logs, but would make every asset request a billable Worker invocation. Page-view analytics belong in a client-side beacon instead; the measurement that matters (how many distinct subscribers there are and when they subscribed via `sid`, which campaign they came from via `utm_source`, and who is still fetching) already reaches the Worker via `/feed.ics`.

`src/site/.assetsignore` keeps `site.test.ts` out of the published bundle.

The hero background and the Open Graph cover image are the same photo (`void` from [lukekorth.com's widefield astrophotography portfolio](https://lukekorth.com/portfolio/widefield-astrophotography/)), hotlinked from that site rather than copied into the repo. It serves the images with `Access-Control-Allow-Origin: *` and no referer check, so link-preview crawlers and browsers both load them directly.

Serving the configurator and the feed from one domain removes the root redirect entirely — it previously pointed at a `pages.dev` host that no longer resolved.

- Checkbox for each category with a short description
- Aurora checkbox reveals a zip code / Canadian postal code input field with a note about calendar sync limitations
- Zip/FSA is looked up against a bundled table of whole-degree `[lat, lon]` pairs (`zip-latitudes.json`, committed to the repo); the resolved latitude is encoded into the URL as `&lat=<n>`, plus `&lon=<n>` when Milky Way is selected — the raw zip is never sent to the worker. "Detect my location" rounds the browser's position the same way. Manually entered southern-hemisphere latitudes carry no longitude, so the worker falls back to the timezone estimate
- Generates a `webcal://` subscription URL as the user toggles categories
- Subscribe buttons for Apple Calendar (`webcal://`) and Google Calendar; the user agent decides which leads
- Copy URL falls back to a selectable input where the clipboard API is unavailable, as in in-app browsers
- `utm_source` from the landing URL is carried into the generated subscription URL for campaign attribution
- A per-visit `sid` (UUIDv7, so it carries its own mint time) is written into the generated subscription URL, so unique subscribers and subscription age can both be read from the usage dataset
- Live preview of upcoming events, capped at whichever of 4 month sections or 20 events comes first. Sections are months that contain events, not calendar months from today, so a sparse selection (eclipses only, say) still previews its next few months rather than coming up empty
- No backend required — pure client-side

`src/site/wall-calendar.html` (`/wall-calendar`) draws wall calendars in the browser. A Worker on the free plan has 10 ms of CPU time per request, and one drawing takes more than ten times that. A static file is free and unlimited. `npm run build:site` bundles `src/shared/wall-calendar/browser.ts` into `src/site/wall-calendar.js`, which is not committed. The `[build]` section of `wrangler.toml` runs it before each deploy.

- Dated events come from `/wall-calendar.json`, so a calendar agrees with the feed. Milky Way nights come from `src/shared/milky-way.ts`, which the `milky-way` category also uses.
- The feed data does not hold the daily curves of one place: the Moon each night, sunrise, sunset, twilight and moonrise. `src/shared/wall-calendar/sky.ts` computes them with short series from Meeus. There is no ephemeris dependency.
- The laser file has filled paths only: no strokes, text, transforms or clipping. Text is drawn from Jost outlines in `jost-glyphs.json`, which `npm run generate-wall-calendar-font` extracts. The print file draws the same paths in other colors.
- Artwork stays in the middle 11 in of the page, which is the engraving depth of a Glowforge Basic.
- The options follow the `#` in the address, so the location is not sent to the server.
- A bad option is an error. The feed parser is tolerant because old URLs must keep working, but a calendar in ink or metal cannot be corrected later.

`src/site/sky.html` (`/sky?lat=<n>&lon=<n>`) is the page that a wall calendar QR code opens. It lists the events of `/feed.json` by month and needs no subscription. An "Add to my calendar" button subscribes to the same events with `utm_source=wall-calendar`. Aurora and launches load in their own requests, because a slow outside service must not delay the other events.

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
| Usage measurement | Cloudflare Workers Analytics Engine |
| Launch data | The Space Devs Launch Library 2 |
| Moon phases, solstices & equinoxes | JPL Horizons API |
| Solar & lunar eclipses | NASA Five Millennium Catalogs |
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
