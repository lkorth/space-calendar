import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fetchMoonPhases, fetchSeasons, findMoonPhases, findSeasons, interpolator, parseLongitudes, quarterCrossings,
} from './sun-moon.ts';
import type { Longitude } from './sun-moon.ts';

const DAY = 86_400_000;
const STEP = DAY / 4;

/** A body that moves at a steady rate, wrapped to 0–360 as Horizons reports it. */
function steady(year: number, startDegrees: number, perDay: number): Longitude[] {
  const first = Date.UTC(year - 1, 11, 28);
  return Array.from({ length: 4 * 374 }, (_, i) => ({
    ms: first + i * STEP,
    degrees: (startDegrees + (i * perDay) / 4) % 360,
  }));
}

function horizonsText(rows: string[]): string {
  return ['Ephemeris header 2020-Jan-01 00:00 1.0', '$$SOE', ...rows, '$$EOE', 'footer'].join('\n');
}

describe('parseLongitudes', () => {
  const rows = [
    ' 2026-Dec-31 00:00     191.8042023  -3.9846148', ' 2026-Dec-31 06:00     195.0373892  -4.1640329',
    ' 2026-Dec-31 12:00     198.2494258  -4.3291044', ' 2026-Dec-31 18:00     201.4412806  -4.4796225',
    ' 2027-Jan-01 00:00     204.6139320  -4.6154237', ' 2027-Jan-01 06:00     207.7695843  -4.7364410',
  ];

  it('reads only the rows between the markers', () => {
    const parsed = parseLongitudes(horizonsText(rows));
    expect(parsed).toHaveLength(6);
    expect(parsed[0]).toEqual({ ms: Date.UTC(2026, 11, 31), degrees: 191.8042023 });
    expect(parsed[5]).toEqual({ ms: Date.UTC(2027, 0, 1, 6), degrees: 207.7695843 });
  });

  it('rejects a response without data', () => {
    expect(() => parseLongitudes('No ephemeris for target')).toThrow('No ephemeris data');
    expect(() => parseLongitudes(horizonsText(rows.slice(0, 2)))).toThrow('Too few positions');
  });
});

describe('interpolator', () => {
  it('follows a curve between points and past 360°', () => {
    const curve = (ms: number) => 350 + 13 * (ms / DAY) + 0.4 * Math.sin(ms / DAY);
    const series = Array.from({ length: 40 }, (_, i) => ({ ms: i * STEP, degrees: curve(i * STEP) % 360 }));
    const at = interpolator(series);
    for (const ms of [0, 0.1 * DAY, 3.37 * DAY, 9.7 * DAY]) expect(at(ms)).toBeCloseTo(curve(ms), 5);
  });
});

describe('quarterCrossings', () => {
  it('names the quarter entered, for angles below zero too', () => {
    const found = quarterCrossings((ms) => -100 + 10 * (ms / DAY), 0, 30 * DAY);
    expect(found.map((c) => c.quarter)).toEqual([3, 0, 1, 2]);
    expect(found[1]!.ms / DAY).toBeCloseTo(10, 3);
  });

  it('counts a crossing on a day boundary once', () => {
    expect(quarterCrossings((ms) => 10 * (ms / DAY), 0, 12 * DAY)).toHaveLength(2); // 0° and 90°
  });
});

describe('findMoonPhases', () => {
  it('finds the phases in order, to the minute, within the year', () => {
    // The Moon gains 12° a day and is level with the Sun on January 2 at 12:00.
    const sun = steady(2027, 280, 1);
    const moon = steady(2027, 280 - 12 * 5.5, 13);
    const phases = findMoonPhases(sun, moon, 2027);
    expect(phases[0]).toEqual({ year: 2027, month: 1, day: 2, time: '12:00', phase: 'New Moon' });
    expect(phases[1]).toEqual({ year: 2027, month: 1, day: 10, time: '00:00', phase: 'First Quarter' });
    expect(phases.slice(2, 4).map((p) => p.phase)).toEqual(['Full Moon', 'Last Quarter']);
    expect(phases.every((p) => p.year === 2027)).toBe(true);
    expect(phases.length).toBe(49);
  });
});

describe('findSeasons', () => {
  it('finds two equinoxes and two solstices', () => {
    const seasons = findSeasons(steady(2027, 276, 360 / 365.25), 2027);
    expect(seasons.map((s) => `${s.phenom} ${s.month}`)).toEqual(['Equinox 3', 'Solstice 6', 'Equinox 9', 'Solstice 12']);
  });
});

describe('fetching', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (url: string) => {
    const moon = new URL(url).searchParams.get('COMMAND') === '301';
    const series = moon ? steady(2030, 214, 13) : steady(2030, 280, 1);
    const month = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const rows = series.map(({ ms, degrees }) => {
      const d = new Date(ms);
      const iso = d.toISOString();
      return ` ${iso.slice(0, 4)}-${month(d)}-${iso.slice(8, 10)} ${iso.slice(11, 16)}     ${degrees.toFixed(7)}  0.0000000`;
    });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ result: horizonsText(rows) }) });
  };

  it('requests each body once for a year, however many generators ask', async () => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([fetchMoonPhases(2030), fetchSeasons(2030), fetchMoonPhases(2030)]);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('COMMAND')).sort()).toEqual(['10', '301']);
  });

  it('tries again after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchSeasons(2031)).rejects.toThrow('404');
    const fetchMock = vi.fn(respond);
    vi.stubGlobal('fetch', fetchMock);
    await fetchSeasons(2031);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
