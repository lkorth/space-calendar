# Space Calendar — Event Format Specification

This document defines how each event type is structured: timing, title format, body content, and sourcing.

---

## General Principles

- **Timed events** use the exact moment in the correct timezone, with UTC offset included in the ICS data so any calendar client converts to the subscriber's local time automatically.
- **All-day events** have no time component — they span the full calendar day.
- **Event bodies** contain 1–2 paragraphs of plain-language description covering what the event is, why it matters, and why it's worth watching — written for a curious non-expert. Followed by key facts and at least one link to an authoritative source.
- **Titles** are concise and self-explanatory without opening the event.

---

## Event Types

---

### Moon Phases

| Field | Value |
|-------|-------|
| Timing | Timed event — the exact moment of the phase |
| Duration | 0 minutes (instantaneous) |
| All-day | No |

**Title format:**
```
Full Moon — Wolf Moon
Full Moon — Harvest Moon
New Moon
```
Full moons always include their traditional name. The Harvest Moon is the full moon nearest the September equinox (dynamically computed per year, can fall in September or October). The Hunter's Moon is the first full moon after the Harvest Moon. All other full moons use month-based names: Wolf (Jan), Snow (Feb), Worm (Mar), Pink (Apr), Flower (May), Strawberry (Jun), Buck (Jul), Sturgeon (Aug), Corn (Sep), Beaver (Nov), Cold (Dec).

**Body:**
- What the phase means and what's visible in the sky
- Note if it's a supermoon, micromoon, or has a traditional name
- Best viewing tips (e.g., full moons rise at sunset, new moons are ideal for deep-sky observing)

**Authoritative source:** [USNO Astronomical Applications](https://aa.usno.navy.mil/)

---

### Meteor Showers

| Field | Value |
|-------|-------|
| Timing | All-day event on the night of peak activity |
| Duration | 1 day |
| All-day | Yes |

**Title format:**
```
Perseid Meteor Shower — Peak Night
Leonid Meteor Shower — Peak Night
```

**Body:**
- Parent comet or asteroid and why it produces the shower
- Expected zenithal hourly rate (ZHR) under ideal conditions
- Best viewing window (typically after midnight, before dawn)
- Whether the moon will interfere and how much
- No equipment needed — just dark skies and patience

**Authoritative source:** [American Meteor Society](https://www.amsmeteors.org/) shower page for that event

---

### Solstices & Equinoxes

| Field | Value |
|-------|-------|
| Timing | Timed event — the exact astronomical moment |
| Duration | 0 minutes (instantaneous) |
| All-day | No |

**Title format:**
```
June Solstice — Summer Solstice (Northern Hemisphere)
December Solstice — Winter Solstice (Northern Hemisphere)
March Equinox — Vernal Equinox (Northern Hemisphere)
September Equinox — Autumnal Equinox (Northern Hemisphere)
```

**Body:**
- What is happening geometrically (Earth's axial tilt relative to the Sun)
- What it means for daylight hours and seasons
- Brief note on cultural or historical significance

**Authoritative source:** [USNO Astronomical Applications](https://aa.usno.navy.mil/)

---

### Solar Eclipses

| Field | Value |
|-------|-------|
| Timing | Timed event — the moment the eclipse first begins anywhere on Earth (first external contact, P1) |
| Duration | Full global duration from P1 to P4 (last external contact anywhere on Earth) |
| All-day | No |

**Title format:**
```
Total Solar Eclipse — Europe & North Africa
Annular Solar Eclipse — South America
Partial Solar Eclipse
```
Include the primary visibility region in the title.

**Body:**
- Type of eclipse (total, annular, hybrid, partial) and what distinguishes it
- Visibility path — where totality or annularity is visible, and where partial phases can be seen
- Safety guidance (never look directly at the sun except during full totality)
- How long until the next similar eclipse in the same region if notable
- Phase timetable (all times in UTC) covering the major contacts across the visibility region:

```
P1  — Partial phase begins (first location on Earth): HH:MM UTC
U1  — Umbral/annular phase begins: HH:MM UTC
Greatest Eclipse:              HH:MM UTC
U4  — Umbral/annular phase ends: HH:MM UTC
P4  — Partial phase ends (last location on Earth): HH:MM UTC

Selected local contact times:
  [City, Country]: partial begins HH:MM, max HH:MM (X% obscured), partial ends HH:MM
  [City, Country]: totality begins HH:MM, mid-totality HH:MM (Xm Xs), totality ends HH:MM
  ...
```

**Authoritative source:** [NASA Eclipse Page](https://science.nasa.gov/eclipses/) for that specific eclipse

---

### Lunar Eclipses

| Field | Value |
|-------|-------|
| Timing | Timed event — the moment the penumbral phase begins (P1) |
| Duration | Full duration from P1 through P4 (penumbral phase ends) |
| All-day | No |

**Title format:**
```
Total Lunar Eclipse — Blood Moon
Partial Lunar Eclipse
Penumbral Lunar Eclipse
```

**Body:**
- Type and what will be visible (penumbral eclipses are subtle; total eclipses turn the moon deep red)
- Which parts of the world can see each phase (the Moon is above the horizon for roughly half the globe)
- Why the moon turns red during totality (Earth's atmosphere bending sunlight)
- Phase timetable (all times in UTC):

```
P1  — Penumbral phase begins:  HH:MM UTC
U1  — Partial umbral phase begins: HH:MM UTC
U2  — Totality begins:         HH:MM UTC  (total eclipses only)
Greatest Eclipse:              HH:MM UTC
U3  — Totality ends:           HH:MM UTC  (total eclipses only)
U4  — Partial umbral phase ends: HH:MM UTC
P4  — Penumbral phase ends:    HH:MM UTC

Duration of totality: Xh Xm  (total eclipses only)
Visible from: [broad regions — e.g., Americas, Europe, Africa, Asia]
```

**Authoritative source:** [NASA Eclipse Page](https://science.nasa.gov/eclipses/) for that specific eclipse

---

### Planetary Oppositions

| Field | Value |
|-------|-------|
| Timing | All-day event on the date of opposition |
| Duration | 1 day |
| All-day | Yes |

**Title format:**
```
Mars at Opposition — Closest & Brightest of the Year
Jupiter at Opposition
Saturn at Opposition
```

**Body:**
- What opposition means (Earth is directly between the planet and the Sun)
- How bright the planet will appear (magnitude) compared to familiar stars
- Whether this is a particularly close or distant opposition and why that matters
- What features are visible through binoculars or a small telescope (Saturn's rings, Jupiter's moons, Mars polar caps, etc.)
- Viewing window — opposition is the peak but the planet is well-placed for weeks around it

**Authoritative source:** [NASA Solar System Exploration](https://solarsystem.nasa.gov/) or JPL Horizons for that planet

---

### Mercury & Venus Elongations

| Field | Value |
|-------|-------|
| Timing | All-day event on the date of greatest elongation |
| Duration | 1 day |
| All-day | Yes |

**Title format:**
```
Mercury at Greatest Eastern Elongation — Evening Star
Mercury at Greatest Western Elongation — Morning Star
Venus at Greatest Eastern Elongation — Evening Star
```

**Body:**
- What elongation means (maximum angular separation from the Sun as seen from Earth)
- Whether to look in the evening western sky or morning eastern sky, and roughly when
- How high above the horizon the planet will appear
- Why inner planets can only ever be seen near sunrise or sunset

**Authoritative source:** [USNO Astronomical Applications](https://aa.usno.navy.mil/) or [In-The-Sky.org](https://in-the-sky.org/)

---

### Notable Asteroid Close Approaches

| Field | Value |
|-------|-------|
| Timing | Timed event — the moment of closest approach |
| Duration | 30 minutes (instantaneous event, minimum for calendar visibility) |
| All-day | No |

**Title format:**
```
Asteroid 2029 BX1 — Close Earth Flyby
Asteroid Apophis — Closest Approach in a Generation
```

**Body:**
- What the object is, its size, and how it was discovered
- Distance of closest approach in lunar distances (LD) and km — with context (e.g., "closer than many satellites")
- Whether it's visible to the naked eye, binoculars, or only telescopes
- Any scientific significance (mission target, unusual composition, record-setting flyby)
- Explicit statement that there is no impact risk, to prevent alarm

**Authoritative source:** [JPL Center for Near Earth Object Studies](https://cneos.jpl.nasa.gov/) or mission page if applicable

---

### Comets

Comets can produce multiple discrete calendar events. Each of the following is its own event entry when applicable:

- **Perihelion** — when the comet is closest to the Sun and typically at peak brightness
- **Closest Earth approach** — when the comet is nearest to Earth (may differ significantly from perihelion)
- **Naked-eye visibility window** — a multi-day span when the comet is predicted to be visible without equipment

| Field | Value |
|-------|-------|
| Timing | Timed event for perihelion and closest Earth approach; all-day span for visibility windows |
| Duration | Instantaneous (30-minute minimum) for perihelion and closest approach; actual predicted window length for visibility spans |
| All-day | No for point events; Yes for visibility windows |

**Title format:**
```
Comet C/2023 A3 (Tsuchinshan-ATLAS) — Perihelion
Comet C/2023 A3 (Tsuchinshan-ATLAS) — Closest Approach to Earth
Comet C/2023 A3 (Tsuchinshan-ATLAS) — Naked-Eye Visibility Window
Comet 12P/Pons-Brooks — Perihelion
```

**Body:**
- What type of comet it is (long-period, short-period, dynamically new), where it came from, and who discovered it
- Predicted peak magnitude and what that means (naked eye, binoculars, telescopes only) — with a note that comet brightness predictions are uncertain and it may over- or underperform
- Where and when to look — constellation, morning or evening sky, whether a tail is expected and its orientation
- For visibility windows: the predicted brightness range across the window
- Distance from Earth and Sun at peak

**Authoritative source:** [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html) for the comet, plus [Comet Watch](https://www.cometwatch.co.uk/) or [Seiichi Yoshida's comet page](http://www.aerith.net/comet/weekly/current.html) for brightness predictions

---

### Aurora Borealis Forecasts

Aurora events are location-aware and generated per subscriber latitude (rounded to nearest whole degree). Each event represents a forecasted geomagnetic storm period where aurora is likely visible at that latitude.

| Field | Value |
|-------|-------|
| Timing | Timed event — start of the forecasted elevated Kp period |
| Duration | Length of the forecasted elevated period (typically 3–12 hours) |
| All-day | No |

**Title format:**
```
Aurora Borealis — Strong Storm Likely Tonight
Aurora Borealis — Moderate Activity Possible
Aurora Borealis — Extreme Storm (Kp 9)
```
Severity language maps to Kp level: Kp 5–6 = Moderate, Kp 7 = Strong, Kp 8 = Severe, Kp 9 = Extreme.

**Body:**
- What the aurora is and what causes it (solar wind interacting with Earth's magnetic field)
- Forecasted Kp level and what that means for visibility at the subscriber's latitude
- Where to look (north-facing horizon, away from light pollution) and what to expect (colors, movement)
- Explicit caveat that forecasts beyond 24 hours carry significant uncertainty and same-day conditions may differ
- Link to real-time tracking for the night of the event

**Authoritative source:** [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/) 3-day forecast, with link to the [aurora forecast map](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) for real-time viewing

---

### Rocket Launches

| Field | Value |
|-------|-------|
| Timing | Timed event — opening of the launch window |
| Duration | Actual length of the launch window (e.g., 30 minutes, 2 hours, instantaneous) |
| All-day | No |

If the launch window is instantaneous, the event duration is set to 30 minutes as a minimum so it is visible on a calendar. If a window closes and the launch slips to a later window or date, the event is updated accordingly.

**Title format:**
```
Falcon Heavy | Europa Clipper
Starship | Integrated Flight Test 7
SLS Block 1B | Artemis IV
New Glenn | Maiden Flight
```
Format: `[Vehicle] | [Mission or Payload Name]`

**Body:**
- What the vehicle is and why it matters (first flight, most powerful rocket, etc.)
- What the payload is, its mission, and its scientific or exploration significance
- Destination and mission duration if applicable
- Launch site and launch window open/close times in UTC
- Where to watch the webcast

**Authoritative sources:** Launch provider's mission page (SpaceX, NASA, ESA, etc.) and/or [The Space Devs launch page](https://thespacedevs.com/) for that mission

---

### Space History Milestones

| Field | Value |
|-------|-------|
| Timing | All-day event on the calendar anniversary date |
| Duration | 1 day |
| All-day | Yes |

**Milestone years:** 20, 25, 50, 75, 100 years after the original event.

**Title format:**
```
50 Years Ago: Apollo 11 — First Humans on the Moon (1969)
25 Years Ago: International Space Station — First Crew Arrives (1998)
20 Years Ago: Mars Exploration Rover Spirit — Landing (2004)
```
Format: `[N] Years Ago: [Mission or Event] — [Short description] ([original year])`

**Body:**
- What happened on the original date and who was involved
- Why the event was significant at the time and what it changed
- Its lasting impact or legacy — what it made possible, what it proved, how it's remembered
- Connection to current or upcoming missions if relevant

**Authoritative source:** [NASA History Division](https://history.nasa.gov/), the original mission page, or the relevant space agency's historical archive

---

## Notes on Timezone Handling

- All timed events are stored in UTC in the ICS file with a proper `TZID` or UTC offset so calendar clients convert automatically to the subscriber's local time.
- Rocket launch times are sourced from the provider and stored as the window open time in UTC. The window close time sets the event end.
- Eclipse events span the full global duration (P1 to P4) in UTC. Since subscriber location is unknown, no attempt is made to localize times — the event body contains a full phase timetable in UTC plus representative local times for major cities across the visibility region.
- All-day events have no timezone — they represent a calendar date, not a moment in time.
