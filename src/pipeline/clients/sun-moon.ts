/**
 * Moon phases, equinoxes and solstices, worked out from JPL Horizons positions.
 *
 * Horizons gives the apparent ecliptic longitudes of the Sun and Moon. A phase is the moment
 * the Moon is a multiple of 90° ahead of the Sun, and a season begins when the Sun's own
 * longitude is one. Six-hourly positions, interpolated, give both to within a few seconds.
 */
import { fetchWithRetry } from './jpl.ts';

const HORIZONS_BASE = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const SUN = '10';
const MOON = '301';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Points the interpolation fits at once */
const FIT = 6;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PHASES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];

/** A moment in UTC, to the nearest minute */
interface Moment {
  year: number;
  month: number;
  day: number;
  /** HH:MM */
  time: string;
}

export interface MoonPhase extends Moment {
  phase: string;
}

export interface Season extends Moment {
  phenom: 'Equinox' | 'Solstice';
}

export interface Longitude {
  ms: number;
  degrees: number;
}

/** Read the table between the $$SOE and $$EOE markers of a Horizons response. */
export function parseLongitudes(text: string): Longitude[] {
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start === -1 || end === -1) throw new Error('No ephemeris data in Horizons response');
  const out: Longitude[] = [];
  // Format: " 2027-Jan-01 06:00     207.7695843  -4.7364410"
  for (const m of text.slice(start, end).matchAll(/(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})\s+([\d.]+)/g)) {
    out.push({
      ms: Date.UTC(Number(m[1]), MONTHS.indexOf(m[2]!), Number(m[3]), Number(m[4]), Number(m[5])),
      degrees: Number(m[6]),
    });
  }
  if (out.length < FIT) throw new Error('Too few positions in Horizons response');
  return out;
}

/** The longitude at any moment within an evenly spaced series. It keeps growing past 360°
 *  rather than wrapping, so that it can be compared and interpolated. */
export function interpolator(series: readonly Longitude[]): (ms: number) => number {
  let turns = 0;
  const values = series.map(({ degrees }, i) => {
    if (i > 0 && degrees < series[i - 1]!.degrees - 180) turns += 360;
    return degrees + turns;
  });
  const first = series[0]!.ms;
  const step = series[1]!.ms - first;

  return (ms) => {
    const x = (ms - first) / step;
    const base = Math.min(Math.max(Math.floor(x) - FIT / 2 + 1, 0), values.length - FIT);
    let sum = 0;
    for (let i = 0; i < FIT; i++) {
      let weight = 1;
      for (let j = 0; j < FIT; j++) if (j !== i) weight *= (x - base - j) / (i - j);
      sum += weight * values[base + i]!;
    }
    return sum;
  };
}

/** Moments when a growing angle passes a multiple of 90°, with which quarter it enters. */
export function quarterCrossings(angle: (ms: number) => number, from: number, to: number): { ms: number; quarter: number }[] {
  const out: { ms: number; quarter: number }[] = [];
  for (let t = from; t < to; t += DAY_MS) {
    const target = Math.ceil(angle(t) / 90) * 90;
    if (target >= angle(t + DAY_MS)) continue; // at most one a day: the Moon gains about 12°
    let lo = t;
    let hi = t + DAY_MS;
    while (hi - lo > 500) {
      const mid = (lo + hi) / 2;
      if (angle(mid) < target) lo = mid;
      else hi = mid;
    }
    out.push({ ms: hi, quarter: (((target / 90) % 4) + 4) % 4 });
  }
  return out;
}

function toMoment(ms: number): Moment {
  const iso = new Date(Math.round(ms / 60_000) * 60_000).toISOString();
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
    time: iso.slice(11, 16),
  };
}

export function findMoonPhases(sun: readonly Longitude[], moon: readonly Longitude[], year: number): MoonPhase[] {
  const sunAt = interpolator(sun);
  const moonAt = interpolator(moon);
  return quarterCrossings((ms) => moonAt(ms) - sunAt(ms), ...searchSpan(year))
    .map(({ ms, quarter }): MoonPhase => ({ ...toMoment(ms), phase: PHASES[quarter]! }))
    .filter((phase) => phase.year === year);
}

export function findSeasons(sun: readonly Longitude[], year: number): Season[] {
  return quarterCrossings(interpolator(sun), ...searchSpan(year))
    .map(({ ms, quarter }): Season => ({ ...toMoment(ms), phenom: quarter % 2 === 0 ? 'Equinox' : 'Solstice' }))
    .filter((season) => season.year === year);
}

/** A day beyond the year at each end, so that rounding cannot drop an event at midnight. */
function searchSpan(year: number): [number, number] {
  return [Date.UTC(year, 0, 1) - DAY_MS, Date.UTC(year + 1, 0, 1) + DAY_MS];
}

const cache = new Map<string, Promise<Longitude[]>>();

/** Several generators need the same year, so each body and year is fetched once per run. */
function longitudes(body: string, year: number): Promise<Longitude[]> {
  const key = `${body}:${year}`;
  let found = cache.get(key);
  if (!found) {
    found = fetchLongitudes(body, year);
    found.catch(() => cache.delete(key));
    cache.set(key, found);
  }
  return found;
}

async function fetchLongitudes(body: string, year: number): Promise<Longitude[]> {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: body,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399', // geocentric
    // Past the search span on both sides, so that every moment is interpolated.
    START_TIME: `${year - 1}-Dec-28`,
    STOP_TIME: `${year + 1}-Jan-05`,
    STEP_SIZE: '6h',
    QUANTITIES: '31', // observer ecliptic longitude and latitude
    EXTRA_PREC: 'YES',
  });
  const res = await fetchWithRetry(`${HORIZONS_BASE}?${params}`);
  if (!res.ok) throw new Error(`JPL Horizons error ${res.status} for body ${body}`);
  return parseLongitudes(((await res.json()) as { result: string }).result);
}

export async function fetchMoonPhases(year: number): Promise<MoonPhase[]> {
  return findMoonPhases(await longitudes(SUN, year), await longitudes(MOON, year), year);
}

export async function fetchSeasons(year: number): Promise<Season[]> {
  return findSeasons(await longitudes(SUN, year), year);
}
