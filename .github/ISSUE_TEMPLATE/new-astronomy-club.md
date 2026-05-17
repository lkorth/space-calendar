---
name: Add astronomy club
about: Request adding a local astronomy club's events to the calendar
title: "Add [Club Name] to astronomy clubs"
labels: astronomy-clubs
assignees: ''
---

## Club details

**Name:**
**Location (City, State/Country):**
**Website URL:**
**Events/registration page URL:** _(the page that lists upcoming public events)_

- [ ] Events have machine-readable dates (not just "every second Friday")
- [ ] The events page is publicly accessible without login

## Why add this club?

_(optional — e.g. notable programs, large public outreach, unique equipment)_

## Checklist for implementors

- [ ] Add a `Club` entry to `CLUBS` in `src/worker/categories/astronomy-clubs.ts` with `id`, `name`, `location`, `websiteUrl`, `scrapeUrl`, and `parseEvents`
- [ ] Write a `parse<ClubId>Events` function and export it
- [ ] Add a `.test.ts` file covering the parser with a real HTML fixture
- [ ] Verify the scrape URL is stable and doesn't require authentication
- [ ] Run `npm test` — all tests pass
- [ ] Test manually with `npm run worker:dev` using `?categories=astronomy-clubs&club=<id>`
