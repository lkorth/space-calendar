# Space Calendar

A free, open source space and astronomy calendar you can subscribe to in Google Calendar, Apple Calendar, Outlook, or any app that supports ICS feeds.

## Why this exists

The New York Times used to publish a space calendar — rocket launches, eclipses, meteor showers, and other astronomical events — as a subscribable ICS feed. It was great. They discontinued it.

Nothing else fills the gap well. Existing options either cover only one category (launches but no sky events, or sky events but no launches), require multiple separate calendar subscriptions, or don't let you filter out the events you don't care about.

This project fixes that: one calendar feed, your choice of categories, updated automatically.

## What's included

You pick which categories you want. Everything appears in a single calendar subscription.

**Sky events** — moon phases, meteor shower peak nights, solar and lunar eclipses, solstices and equinoxes

**Planetary events** — oppositions (best viewing nights for Mars, Jupiter, Saturn), Mercury and Venus elongations, notable asteroid close approaches, comets

**Rocket launches** — crewed missions, maiden flights, heavy-lift vehicles (Falcon Heavy, Starship, SLS, New Glenn), and flagship science payloads. No Starlink batches.

**Space history milestones** — 20, 25, 50, 75, and 100-year anniversaries of landmark moments in spaceflight and astronomy

**Aurora borealis** — location-aware forecasts based on NOAA's 3-day Kp index. Enter your zip code and only get notified when a storm is likely visible at your latitude. Note: for same-day alerts, use a real-time app — calendar sync isn't fast enough.

## How to subscribe

Visit the [configurator](https://lkorth.github.io/space-calendar/), select your categories, and copy the subscription URL into your calendar app.

## JSON API

The same data is also available as JSON if you want to use it outside of a calendar app:

```
GET https://space-calendar.lukekorth.com/feed.json?c=moon-phases,meteor-showers
```

Returns `{ "name": "...", "events": [...] }` where each event is a `CalendarEvent` object. Accepts the same query parameters as the ICS feed:

| Parameter | Description |
|-----------|-------------|
| `c` | Comma-separated category slugs (required). Same slugs as the ICS feed. |
| `lat` | Whole-degree latitude. Required for `aurora` and `aurora-australis`. Use a negative value for southern hemisphere. |
| `hemi` | `north` (default) or `south`. Affects solstice/equinox event titles and descriptions. |
| `tz` | IANA timezone string (e.g. `America/New_York`). Used for contact times in event descriptions. |
| `club` | Astronomy club ID (e.g. `jgap`). Required for `astronomy-clubs`. |

Prefer a real IANA zone name for `tz`. A fixed offset (`UTC+2`, `+02:00`) is accepted, but
it carries no daylight-saving rules, so times in event descriptions will be an hour off for
part of the year if your region observes DST.

## How it works

Static astronomical data (eclipses, moon phases, meteor showers, planetary events, history milestones) is generated once a year from USNO and JPL data via GitHub Actions and stored in this repo. Rocket launch data is fetched live from [The Space Devs Launch Library 2](https://thespacedevs.com/llapi) and cached hourly. Aurora forecasts are fetched from [NOAA SWPC](https://www.swpc.noaa.gov/) and cached every few hours. A Cloudflare Worker merges the requested categories into a single ICS or JSON response at request time.

## Documentation

- [**CATEGORIES.md**](CATEGORIES.md) — every included and excluded event category, with reasoning
- [**EVENT_FORMAT.md**](EVENT_FORMAT.md) — how each event type is structured: timing, title format, body content, and source links
- [**ARCHITECTURE.md**](ARCHITECTURE.md) — system design, data flow, and tech stack

## Contributing

Contributions welcome. The most valuable ongoing contribution is maintaining the curated data files:

- **`history.yaml`** — adding space history events so milestone anniversaries appear on the calendar
- **`comets.yaml`** — adding notable comets when they're discovered or confirmed as naked-eye visible

For bugs, data corrections, or feature requests, open a pull request or issue.

## License

[MIT](/LICENSE)
