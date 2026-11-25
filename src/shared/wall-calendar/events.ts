/** The dated events on a wall calendar, read from the same calendar data the feed serves. Events are
 *  recognized by UID, which is stable, rather than by title, which is not. The one exception
 *  is a full moon's name, which only the title carries. */
import type { CalendarEvent, CategorySlug } from '../models.ts';
import { DAY_MS, HOUR_MS } from './clock.ts';
import type { LocalClock } from './clock.ts';
import { moonAltitude, moonPhase, sunAltitude, sunMoonSeparation } from './sky.ts';
import type { Place } from './sky.ts';

/** Categories a wall calendar draws, kept for whole calendar years in data/wall-calendar-events.json. */
export const WALL_CALENDAR_CATEGORIES: readonly CategorySlug[] = [
  'moon-phases', 'eclipses-solar', 'eclipses-lunar', 'solstices-equinoxes', 'meteor-showers', 'oppositions',
];

/** Oppositions worth a label. Uranus and Neptune need a telescope. */
const OPPOSITION_PLANETS = new Set(['mars', 'jupiter', 'saturn']);

/** A shallower graze of Earth's outer shadow cannot be seen. */
const MIN_LUNAR_ECLIPSE_MS = HOUR_MS;

/** Centers this close means the Moon covers part of the Sun. */
const SOLAR_CONTACT_DEG = 0.53;

export interface FullMoon { day: number; name: string }

export interface Eclipse {
  day: number;
  kind: 'lunar' | 'solar';
  /** Penumbral, Partial, Total, Annular or Hybrid */
  type: string;
  visible: boolean;
  /** "AROUND 3 AM", "AT MOONRISE", … Only when visible. */
  when?: string;
}

export interface Dated { day: number; name: string }
export interface Shower extends Dated { moonPercent: number }

export interface YearEvents {
  fullMoons: FullMoon[];
  newMoons: number[];
  eclipses: Eclipse[];
  /** Month 3, 6, 9 or 12 */
  seasons: { day: number; month: number }[];
  showers: Shower[];
  oppositions: Dated[];
}

export function readYearEvents(
  events: readonly CalendarEvent[],
  year: number,
  clock: LocalClock,
  place: Place,
): YearEvents {
  const out: YearEvents = { fullMoons: [], newMoons: [], eclipses: [], seasons: [], showers: [], oppositions: [] };
  const inYear = (day: number) => new Date(day).getUTCFullYear() === year;

  for (const event of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    // An all-day event already names its date; a timed one falls on a local date.
    const day = event.allDay ? Date.parse(event.start.slice(0, 10)) : clock.dayOf(Date.parse(event.start));

    if (event.category === 'eclipses-lunar') {
      const eclipse = lunarEclipse(event, clock, place);
      if (eclipse && inYear(eclipse.day)) out.eclipses.push(eclipse);
      continue;
    }
    if (event.category === 'eclipses-solar') {
      const eclipse = solarEclipse(event, day, clock, place);
      if (inYear(eclipse.day)) out.eclipses.push(eclipse);
      continue;
    }
    if (!inYear(day)) continue;

    if (event.category === 'moon-phases') {
      const name = fullMoonName(event.title);
      if (name) out.fullMoons.push({ day, name });
      else out.newMoons.push(day);
    } else if (event.category === 'solstices-equinoxes') {
      out.seasons.push({ day, month: new Date(event.start).getUTCMonth() + 1 });
    } else if (event.category === 'meteor-showers') {
      const name = /^meteor-shower-(.+)-\d{4}@/.exec(event.uid)?.[1];
      if (!name) continue;
      // The Moon at 2 AM, in the hours when the shower is watched.
      const { fraction } = moonPhase(clock.at(day + DAY_MS, 2));
      out.showers.push({ day, name: name.replace(/-/g, ' ').toUpperCase(), moonPercent: Math.round(fraction * 100) });
    } else if (event.category === 'oppositions') {
      const planet = /^opposition-([a-z]+)-/.exec(event.uid)?.[1];
      if (planet && OPPOSITION_PLANETS.has(planet)) out.oppositions.push({ day, name: planet.toUpperCase() });
    }
  }
  return out;
}

/** "WOLF" from "🌕 Full Moon — Wolf Moon (Supermoon)", or null for a new moon. */
export function fullMoonName(title: string): string | null {
  if (!title.includes('Full Moon')) return null;
  if (title.includes('Blue Moon')) return 'BLUE';
  const name = /— (.+?) Moon/.exec(title)?.[1] ?? '';
  return name.toUpperCase().replace("'", '’');
}

const eclipseType = (title: string) => /(Penumbral|Partial|Total|Annular|Hybrid)/.exec(title)?.[1] ?? 'Partial';

function lunarEclipse(event: CalendarEvent, clock: LocalClock, place: Place): Eclipse | null {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (end - start < MIN_LUNAR_ECLIPSE_MS) return null;
  const listed = event.contactTimes?.find(({ label }) => label.startsWith('Greatest'))?.utc;
  // The middle of the eclipse is the same moment to within a few minutes, so it stands in
  // when greatest eclipse is missing or falls outside the event.
  const parsed = listed ? Date.parse(listed) : NaN;
  const greatest = parsed >= start && parsed <= end ? parsed : (start + end) / 2;

  const up = (ms: number) => moonAltitude(ms, place) > 0;
  const visible = up(start) || up(greatest) || up(end);
  return {
    day: clock.dayOf(greatest),
    kind: 'lunar',
    type: eclipseType(event.title),
    visible,
    ...(visible && {
      when: up(greatest) ? `AROUND ${clock.nearestHour(greatest)}` : up(end) ? 'AT MOONRISE' : 'AT MOONSET',
    }),
  };
}

function solarEclipse(event: CalendarEvent, utcDay: number, clock: LocalClock, place: Place): Eclipse {
  // The event says only which UTC date; the Moon is near the Sun for a few hours of it.
  let best: { ms: number; separation: number } | null = null;
  for (let ms = utcDay - 6 * HOUR_MS; ms <= utcDay + 30 * HOUR_MS; ms += HOUR_MS / 12) {
    if (sunAltitude(ms, place) < -0.5) continue;
    const separation = sunMoonSeparation(ms, place);
    if (separation < SOLAR_CONTACT_DEG && (!best || separation < best.separation)) best = { ms, separation };
  }
  const type = eclipseType(event.title);
  if (!best) return { day: utcDay, kind: 'solar', type, visible: false };
  // Total or annular only along a narrow track; anywhere else it is partial.
  const central = best.separation < 0.02;
  return {
    day: clock.dayOf(best.ms),
    kind: 'solar',
    type: central ? type : 'Partial',
    visible: true,
    when: `AROUND ${clock.nearestHour(best.ms)}`,
  };
}
