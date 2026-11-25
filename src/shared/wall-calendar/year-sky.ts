import { MIN_DARK_HOURS, milkyWayWindowForNight } from '../milky-way.ts';
import { DAY_MS, HOUR_MS } from './clock.ts';
import type { LocalClock } from './clock.ts';
import { ASTRONOMICAL_DARK_ALT, RISE_SET_ALT, moonPhase, moonUpSpans, solarNoon, sunCrossing } from './sky.ts';
import type { Crossing, Place } from './sky.ts';

/** Nights in a row that make a Milky Way window worth drawing. */
const MIN_MILKY_WAY_RUN = 3;

/** Local dates of a year, as UTC midnights. */
export function daysOfYear(year: number): number[] {
  const first = Date.UTC(year, 0, 1);
  return Array.from({ length: (Date.UTC(year + 1, 0, 1) - first) / DAY_MS }, (_, i) => first + i * DAY_MS);
}

/** The Moon at 9 PM on each date. */
export function moonsAtNine(days: readonly number[], clock: LocalClock): { fraction: number; waxing: boolean }[] {
  return days.map((day) => moonPhase(clock.at(day, 21)));
}

export interface SunDay {
  sun: Crossing;
  /** Where the Sun crosses −18° */
  dark: Crossing;
  noon: number;
  /** Hours of daylight */
  length: number;
}

/** One more day than asked for, because the last night ends the morning after. */
export function sunDays(days: readonly number[], clock: LocalClock, place: Place): SunDay[] {
  return [...days, days.at(-1)! + DAY_MS].map((day) => {
    const noon = solarNoon(clock.at(day, 12), place.lon);
    const sun = sunCrossing(noon, place, RISE_SET_ALT);
    return {
      noon,
      sun,
      dark: sunCrossing(noon, place, ASTRONOMICAL_DARK_ALT),
      length: sun === 'above' ? 24 : sun === 'below' ? 0 : (sun.set - sun.rise) / HOUR_MS,
    };
  });
}

/** One night in clock hours after midnight of the date it begins on. */
export interface Night {
  sunset: number;
  sunrise: number;
  /** When full darkness begins and ends. Null when it never gets fully dark. */
  dusk: number | null;
  dawn: number | null;
  moonUp: [number, number][];
}

export function nights(days: readonly number[], suns: readonly SunDay[], clock: LocalClock, place: Place): Night[] {
  return days.map((day, i) => {
    const evening = suns[i]!;
    const morning = suns[i + 1]!;
    const middle = (evening.noon + morning.noon) / 2;
    // With no sunset the night is empty; with no daylight it lasts noon to noon.
    const edge = (c: Crossing, side: 'rise' | 'set', noon: number) =>
      c === 'above' ? middle : c === 'below' ? noon : c[side];
    const set = edge(evening.sun, 'set', evening.noon);
    const rise = edge(morning.sun, 'rise', morning.noon);
    const hours = (ms: number) => clock.hoursAfter(day, ms);
    const dark = evening.dark !== 'above' && morning.dark !== 'above';
    return {
      sunset: hours(set),
      sunrise: hours(rise),
      dusk: dark ? hours(edge(evening.dark, 'set', evening.noon)) : null,
      dawn: dark ? hours(edge(morning.dark, 'rise', morning.noon)) : null,
      moonUp: moonUpSpans(set, rise, place).map(([a, b]): [number, number] => [hours(a), hours(b)]),
    };
  });
}

export interface MilkyWay {
  /** Hours of good viewing on each night that is part of a run, or 0 */
  hours: number[];
  /** First and last index of the run with the most hours in all */
  best: [number, number] | null;
}

/** Nights the calendar's Milky Way category would list, by the same rules. */
export function milkyWay(days: readonly number[], clock: LocalClock, place: Place): MilkyWay {
  const byNight = new Map<number, number>();
  // A night belongs to the date it begins on, which can be a UTC date either side.
  for (let day = days[0]! - DAY_MS; day <= days.at(-1)! + DAY_MS; day += DAY_MS) {
    const window = milkyWayWindowForNight(new Date(day), place.lat, place.lon);
    if (!window || window.hours < MIN_DARK_HOURS) continue;
    const start = day + window.startHour * HOUR_MS;
    const night = clock.dayOf(start - 12 * HOUR_MS);
    byNight.set(night, Math.max(byNight.get(night) ?? 0, window.hours));
  }

  const found = days.map((day) => byNight.get(day) ?? 0);
  // Once a year, when the core is due south at 12h UTC, the feed's scan jumps a day and skips
  // a night. The Moon cannot spoil one night and spare both its neighbors, so fill it in.
  const hours = found.map((h, i) => {
    const before = found[i - 1] ?? 0;
    const after = found[i + 1] ?? 0;
    return h === 0 && before > 0 && after > 0 ? (before + after) / 2 : h;
  });
  let best: [number, number] | null = null;
  let bestTotal = 0;
  for (let i = 0; i < hours.length; ) {
    if (hours[i] === 0) {
      i++;
      continue;
    }
    let end = i;
    while (end + 1 < hours.length && hours[end + 1]! > 0) end++;
    const run = hours.slice(i, end + 1);
    const total = run.reduce((a, b) => a + b, 0);
    if (run.length < MIN_MILKY_WAY_RUN) hours.fill(0, i, end + 1);
    else if (total > bestTotal) {
      bestTotal = total;
      best = [i, end];
    }
    i = end + 1;
  }
  return { hours, best };
}
