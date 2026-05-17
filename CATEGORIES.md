# Space Calendar — Event Categories

This document defines which event types are included in the calendar, which are explicitly excluded, and the reasoning behind each decision.

## Included Categories

### Celestial — Sky Events
Events visible to the naked eye that require no special equipment and broadly relevant to skywatchers worldwide. Add `&hemi=south` to your subscription URL for Southern Hemisphere season labeling.

| Category | Description |
|----------|-------------|
| Moon phases | New moon, full moon — full moons include their traditional name (Wolf Moon, Harvest Moon, etc.), Blue Moon notation when a month contains two full moons, and Supermoon notation when the Moon is within 362,000 km of Earth |
| Meteor showers | Peak activity nights for annual showers |
| Solstices & equinoxes | The four seasonal turning points — titles and descriptions reflect the correct season for your hemisphere |
| Solar eclipses | Worldwide |
| Lunar eclipses | Worldwide |

### Lunar Occultations
When the Moon passes directly in front of a naked-eye planet or 1st/2nd magnitude star, briefly hiding it from view. Occultations are among the most dramatic naked-eye events — the target disappears almost instantaneously and reappears just as suddenly. Only events visible from a significant land area (not just polar or oceanic regions) are included.

| Target type | Threshold |
|-------------|-----------|
| Planets | Mercury, Venus, Mars, Jupiter, Saturn |
| Stars | 1st and 2nd magnitude (e.g. Regulus, Antares) |

Events are curated in `occultations.yaml` and include approximate disappearance/reappearance times in UTC and visibility region.

### Celestial — Planetary
Significant planetary viewing events. Conjunctions are excluded (see below).

| Category | Description |
|----------|-------------|
| Planetary oppositions | When outer planets (Mars, Jupiter, Saturn, Uranus, Neptune) are closest and brightest |
| Mercury & Venus elongations | Best windows to spot inner planets in the evening or morning sky |
| Notable asteroid close approaches | Significant Earth flybys worth tracking |
| Comets | Naked-eye or binocular comets — perihelion passages, closest Earth approaches, and peak brightness windows |

### Aurora Borealis Forecasts
Location-aware — requires the user to provide a US zip code or Canadian postal code (first 3 characters). Events are generated only when NOAA's 3-day Kp forecast meets or exceeds the visibility threshold for the user's latitude. Updates every 3–4 hours.

**Note shown in configurator:** Calendar apps sync every few hours at best. Aurora events forecasted 1–3 days out will appear in time, but same-day storms may not. For real-time alerts, supplement with [SpaceWeatherLive](https://www.spaceweatherlive.com/) or [NOAA SWPC](https://www.swpc.noaa.gov/).

| Latitude (°N) | Minimum Kp for visibility |
|---------------|--------------------------|
| 65+ | Kp 1 |
| 55–65 | Kp 3 |
| 50–55 | Kp 5 |
| 45–50 | Kp 6 |
| 40–45 | Kp 7 |
| 35–40 | Kp 8 |
| <35 | Kp 9 (extreme storms only) |

### Rocket Launches
Not every launch — only those with broad public interest. The goal is signal, not noise. Includes:

- **Crewed missions** — any mission with humans aboard, any provider
- **Maiden flights** — the first launch of a new vehicle or a new launch provider's debut
- **Heavy-lift launches** — Falcon Heavy, Starship, SLS, New Glenn, Vulcan Centaur, and equivalent vehicles
- **Flagship science & exploration payloads** — NASA Discovery/New Frontiers/Flagship-class missions, major space telescopes, planetary probes, lunar and Mars landers, and international equivalents (ESA, JAXA, ISRO, CNSA)

### Space History Milestones
Significant anniversaries of landmark moments in spaceflight and astronomy. Only milestone years are included — not every anniversary.

**Milestone years:** 20, 25, 50, 75, 100 years

Covers events such as:
- Human spaceflight firsts (first human in space, first Moon landing, first spacewalk, etc.)
- Robotic mission milestones (Voyager encounters, Hubble launch, JWST first light, Mars rover landings, etc.)
- Major program anniversaries (Apollo, Space Shuttle, ISS, etc.)

---

## Excluded Categories

### Planetary Conjunctions
When two planets appear close together in the sky. Excluded because they occur frequently (sometimes monthly) and most are not visually striking enough to be calendar-worthy. The signal-to-noise ratio is too low.

### Routine Rocket Launches
High-cadence, low-public-interest launches are excluded:
- **Starlink batches** — SpaceX launches dozens per year; individually unremarkable
- **Other satellite constellations** (OneWeb, etc.)
- **Routine GEO communications satellites**
- **Routine ISS cargo resupply** (crewed missions still qualify)

### Space History Disasters
Events such as Apollo 1, Challenger, and Columbia are excluded. These are significant, but a space calendar is primarily a forward-looking tool for skywatching and launch tracking. Memorial observances are better handled elsewhere.

### Space History Anniversaries Under 20 Years
Events less than 20 years old are excluded from the history milestone category. A 10-year anniversary of a recent mission lacks the retrospective weight that makes history milestones feel meaningful. The minimum threshold is 20 years.

### Aurora Forecasts (Excluded from general calendar)
Same-day and hour-scale aurora events cannot be delivered reliably via a subscribed ICS feed — Google Calendar syncs every 8–24 hours, Apple Calendar every 1–4 hours. Aurora is included as an opt-in location-aware category (see above), but only for events forecasted 1–3 days out from NOAA's Kp forecast. Users are notified in the configurator that real-time alerts require a dedicated app (SpaceWeatherLive, NOAA SWPC).

### ISS Visible Passes
Highly location-dependent (varies by city and viewing window) and changes daily. Not suitable for a general subscription calendar.
