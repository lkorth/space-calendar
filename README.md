# Space Calendar

[![Sponsor](https://img.shields.io/badge/sponsor-%E2%9D%A4-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/lkorth)

A free, open source space and astronomy calendar you can subscribe to in Google Calendar, Apple Calendar, Outlook, or any app that supports ICS feeds.

## Why this exists

The New York Times used to publish a space calendar (rocket launches, eclipses, meteor showers, and other astronomical events) as a subscribable ICS feed, but it was discontinued.

Nothing else fills the void. Existing options either cover only one category (launches but no sky events, or sky events but no launches), require multiple separate calendar subscriptions, or don't let you filter out the events.

This project fixes that, one automatically updating calendar feed with your choice of categories.

## What's included

You pick which categories you want. Everything appears in a single calendar subscription.

**Sky events**: moon phases, meteor shower peak nights, solar and lunar eclipses, solstices and equinoxes

**Planetary events**: oppositions (best viewing nights for Mars, Jupiter, Saturn), Mercury and Venus elongations, notable asteroid close approaches, comets

**Rocket launches**: crewed missions, maiden flights, heavy-lift vehicles (Falcon Heavy, Starship, SLS, New Glenn), and flagship science payloads. No Starlink batches.

**Space history milestones**: 20, 25, 50, 75, and 100-year anniversaries of landmark moments in spaceflight and astronomy

**Aurora borealis**: location-aware forecasts based on NOAA's 3-day Kp index. Enter your zip code and only get notified when a storm is likely visible at your latitude. Note: for same-day alerts, use a real-time app, since calendar sync isn't fast enough.

## How to subscribe

Visit the [configurator](https://space-calendar.lukekorth.com/), select your categories, then add it straight to Apple Calendar or Google Calendar. Or copy the URL into any app that takes an ICS feed.

## JSON API

The same data is also available as JSON if you want to use it outside of a calendar app:

```
GET https://space-calendar.lukekorth.com/feed.json?c=moon-phases,meteor-showers
```

Returns `{ "name": "...", "events": [...] }` where each event is a `CalendarEvent` object. Accepts the same query parameters as the ICS feed:

| Parameter | Description |
|-----------|-------------|
| `c` | Comma-separated category slugs (required). Same slugs as the ICS feed. |
| `lat` | Whole-degree latitude. Required for `aurora`, `aurora-australis` and `milky-way`. Use a negative value for southern hemisphere. |
| `lon` | Whole-degree longitude, negative west of Greenwich. Optional; used by `milky-way` to time viewing windows. When omitted, longitude is estimated from `tz`. |
| `hemi` | `north` (default) or `south`. Affects solstice/equinox event titles and descriptions. |
| `tz` | IANA timezone string (e.g. `America/New_York`). Used for contact times in event descriptions. |
| `club` | Astronomy club ID (e.g. `jgap`). Required for `astronomy-clubs`. |

Responses set `Cache-Control: max-age=3600` and an `ETag`. If you poll the feed, send the
ETag back as `If-None-Match` and you'll get a `304 Not Modified` instead of the whole
calendar.

Prefer a real IANA zone name for `tz`. A fixed offset (`UTC+2`, `+02:00`) is accepted, but
it carries no daylight-saving rules, so times in event descriptions will be an hour off for
part of the year if your region observes DST.

## Wall calendars

[Make a wall calendar](https://space-calendar.lukekorth.com/wall-calendar) draws a full year of sky for one place. The result is a 16 × 12 in SVG to print or laser engrave. Your browser draws it, so your location stays on your computer.

"Copy link" on the page makes a link that opens the same calendar. The configurator links to a finished calendar when it knows your location. To write a link yourself, put the options after the `#`:

```
https://space-calendar.lukekorth.com/wall-calendar#type=year-wheel-night&lat=40&lon=-83&tz=America/New_York&place=Ohio&qr=true
```

| Option | Required | Description |
|--------|----------|-------------|
| `type` | Yes | The type of calendar. See the next table. A link without it opens the moon calendar. |
| `lat` | Yes | Latitude in degrees, from -90 to 90. South is negative. It is rounded to 0.1°. |
| `lon` | Yes | Longitude in degrees, from -180 to 180. West is negative. It is rounded to 0.1°. |
| `tz` | Yes | IANA timezone of the place, such as `America/New_York`. A link without it uses the timezone of the browser. |
| `place` | No | The location name to print, up to 24 characters. The default is the latitude, such as `40° N`. |
| `qr` | No | `true` adds a QR code. The default is `false`. Year wheels only. |
| `year` | No | This year or the next. The default is this year, or the next year from October. A link with a year that is not available opens the latest year and says so. |

A link includes the location. Browsers do not send the part after the `#` to the server.

| `type` | What it shows |
|--------|---------------|
| `moon-calendar` | The Moon on every day of the year, with full moons, new moons and eclipses |
| `year-wheel-day` | The year as a circle, with the hours of daylight, moon phases, Milky Way nights and events |
| `year-wheel-night` | The same circle, with sunset, sunrise, full darkness, midnight and the hours that the Moon is up |

The page has two files to download. "Download" gives a print file, which is light on dark. "Download for engraving" gives only filled black paths, and a red outline marks the edge of the page. Before you engrave, set the red outline to Ignore in the laser software.

The QR code opens a page that lists the events for that place, such as [/sky?lat=40&lon=-83](https://space-calendar.lukekorth.com/sky?lat=40&lon=-83). The page needs no subscription. It has an optional button that adds the events to a calendar app. The link has only whole degrees.

To draw a calendar on your own computer, use the same options. `--mode` is `print` (default) or `laser`:

```bash
npm run -s wall-calendar -- --type moon-calendar --lat 40 --lon -83 --tz America/New_York --place Ohio --mode laser > moon.svg
```

### Wall calendar data

```
GET https://space-calendar.lukekorth.com/wall-calendar.json
```

Returns `{ "events": [...] }`, the events that the calendars are drawn from. They are the moon phases, eclipses, seasons, meteor showers and oppositions of this calendar year and the next. Each event is a `CalendarEvent` object with an empty description. The response sets `Cache-Control: max-age=86400` and allows requests from any origin. If the data is not ready, the status is `503`.

## How it works

Static astronomical data (eclipses, moon phases, meteor showers, planetary events, history milestones) is generated every month from JPL and NASA data via GitHub Actions and stored in this repo. Rocket launch data is fetched live from [The Space Devs Launch Library 2](https://thespacedevs.com/llapi) and cached hourly. Aurora forecasts are fetched from [NOAA SWPC](https://www.swpc.noaa.gov/) and cached every few hours. A Cloudflare Worker merges the requested categories into a single ICS or JSON response at request time.

## Documentation

- [**CATEGORIES.md**](CATEGORIES.md) — every included and excluded event category, with reasoning
- [**EVENT_FORMAT.md**](EVENT_FORMAT.md) — how each event type is structured: timing, title format, body content, and source links
- [**ARCHITECTURE.md**](ARCHITECTURE.md) — system design, data flow, and tech stack

## Contributing

Contributions welcome. The most valuable ongoing contribution is maintaining the curated data files:

- **`history.yaml`** — adding space history events so milestone anniversaries appear on the calendar
- **`comets.yaml`** — adding notable comets when they're discovered or confirmed as naked-eye visible

For bugs, data corrections, or feature requests, open a pull request or issue.

## Support

Space Calendar is free, has no ads, and requires no account. If it's useful to you, [sponsoring on GitHub](https://github.com/sponsors/lkorth) helps cover what it costs to run.

## License

[MIT](/LICENSE)
