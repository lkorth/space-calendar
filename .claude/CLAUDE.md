# Space Calendar — Agent Guide

## What this repo is

A subscribable ICS calendar feed for space and astronomy events (moon phases, eclipses, meteor showers, planetary events, rocket launches, aurora forecasts, space history). Users pick categories from a configurator page and get a single `webcal://` subscription URL. No ads, no accounts — fully open source.

## How to run things

```bash
npm test                         # unit tests only (vitest) — what CI runs on PRs
npm run test:e2e                 # e2e tests against live worker — run after deploying
npm run test:integration         # integration tests hitting live third-party APIs — run manually
npm run typecheck                # TypeScript type check (both pipeline and worker tsconfigs)
npm run pipeline                 # run all data generators → writes to data/
npm run pipeline -- --generator moon-phases  # run one generator
npm run pipeline -- --year 2027  # generate for a specific year
npm run worker:dev               # local Cloudflare Worker dev server
```

## Code layout

```
src/
  pipeline/
    clients/      # typed API clients (USNO, JPL, NASA, AMS)
    generators/   # one file per category slug — reads APIs, writes CalendarEvent[]
    run.ts        # CLI orchestrator — registers all generators
  worker/
    categories/   # worker-side category handlers (static.ts, aurora.ts, launches.ts)
    clients/      # live-data clients used by the worker (noaa.ts, launch-library.ts)
    ics.ts        # ICS serializer
    index.ts      # Cloudflare Worker entry point — routing + category dispatch
  shared/
    models.ts     # shared types and constants (CategorySlug, CalendarEvent, STATIC_CATEGORIES)
data/             # pre-generated JSON files, one per category — committed to repo
occultations.yaml # curated lunar occultation events
comets.yaml       # curated notable comets
history.yaml      # curated space history events for milestone anniversaries
```

## Two kinds of categories

| Kind | Examples | How data gets there |
|------|----------|---------------------|
| **Static** | moon-phases, eclipses, history | Pipeline runs annually (or on YAML change), writes JSON to `data/` and KV |
| **Live** | launches, aurora | Worker fetches from external API on request, caches in KV with TTL |

To add a **static category**: add slug to `CategorySlug` and `STATIC_CATEGORIES` in `models.ts`, write a generator in `src/pipeline/generators/`, register it in `src/pipeline/run.ts`, and add the category to the `labels` map in `src/worker/index.ts`.

To add a **live category**: add slug to `CategorySlug` and `LIVE_CATEGORIES` in `models.ts`, write a `Category` implementation in `src/worker/categories/`, and register it in `src/worker/index.ts`.

## Adding curated data

- **Space history events** → `history.yaml`. The generator emits only entries whose anniversaries (20/25/50/75/100 years) fall in the current pipeline year.
- **Notable comets** → `comets.yaml`. The weekly generator fetches updated JPL data for each listed comet.
- **Lunar occultations** → `occultations.yaml`. The annual generator filters by year. Add entries when notable occultations (bright planets or 1st/2nd mag stars) are identified.

## Testing requirements

**Always write tests.** Prefer test-driven development — write the test first, then the implementation.

- Every new generator must have a corresponding `.test.ts` file in the same directory.
- Extract pure helper functions from generators so they can be tested without mocking external APIs.
- Worker category logic (e.g., aurora threshold, cache key format) must be covered by unit tests.
- Run `npm test` and verify all tests pass before committing.
- Test files live alongside the code they test (`foo.ts` → `foo.test.ts`).

### Three test tiers

| Tier | Pattern | Script | When it runs |
|------|---------|--------|--------------|
| **Unit** | `*.test.ts` | `npm test` | Every PR (blocking) |
| **Integration** | `*.integration.test.ts` | `npm run test:integration` | Weekly schedule (non-blocking) |
| **E2E** | `*.e2e.test.ts` | `npm run test:e2e` | Post-deploy (non-blocking on PRs) |

Unit tests run in isolation and must never hit external APIs or the live worker. Integration tests hit real third-party URLs (scrapers, APIs) and are flaky by nature — run manually or on a schedule, never as a PR gate. E2E tests hit the live deployed worker and run automatically after each deploy.

### E2E tests

Any change to worker routing, new categories, or new validation rules requires e2e coverage in `src/worker/feed.e2e.test.ts`. These tests hit the live deployed worker at `https://space-calendar.lukekorth.com`.

**E2E tests must be committed separately, after the feature is deployed.** Writing them before deployment guarantees they fail (the live worker doesn't have the new code yet), so you can't confirm they actually test the right thing. The correct workflow is:

1. Implement the feature with unit tests — commit.
2. Deploy: `npm run worker:deploy`.
3. Verify the new behavior manually against the live endpoint.
4. Add e2e tests — commit.

## Commit message style

- Do **not** mention test counts in commit messages (e.g. "Adds 7 tests", "200 tests passing"). Tests are an implementation detail — the commit message should describe what changed and why, not how many tests verify it.
- Focus on the what and why: what behavior was added/changed, and why it matters.

## Key conventions

- All times are UTC in the ICS file. Calendar clients convert to local time automatically.
- Static data is pre-generated on a rolling schedule (6 months back, 1 year ahead); the `data/` JSON files are the source of truth for what the worker serves.
- The `data/` JSON must be manually updated whenever generator logic changes that affects existing event titles or descriptions — run the pipeline or update the file directly.
- Category slugs must be consistent everywhere: `models.ts`, `run.ts` (pipeline), `index.ts` (worker labels map), and `CATEGORIES.md` documentation.
- Event UIDs are stable identifiers — do not change them without a migration plan, as calendar clients use them to deduplicate and update events.

## Documentation files

**Always update the relevant docs as part of the same change — not as a follow-up.** Each doc has a clear ownership:

- `CATEGORIES.md` — what's included and excluded, and why. Update when adding/removing categories or clubs.
- `EVENT_FORMAT.md` — title format, timing, and body content for each event type. Update when changing how events are titled or described.
- `ARCHITECTURE.md` — system design, data flow, pipeline schedules, KV key patterns, and data window policy. Update when changing infrastructure, pipeline schedules, data sources, or rolling window behavior.
- `README.md` — user-facing overview. Update when the feature set changes in a user-visible way.

## Common pitfalls

- The pipeline generates a rolling window (6 months back, 1 year ahead) by default, spanning up to two calendar years. The `data/` JSON is overwritten on each run. Use `--year N` to generate for a specific year instead.
- USNO API endpoints differ between features — check `src/pipeline/clients/usno.ts` before assuming a new endpoint exists.
- JPL Horizons output is plain text embedded in JSON — always check the `$$SOE`/`$$EOE` markers and test your regex against real output.
- Cloudflare Workers KV is eventually consistent. Don't assume a `put` is immediately visible to concurrent reads.
