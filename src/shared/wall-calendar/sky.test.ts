import { describe, it, expect } from 'vitest';
import {
  ASTRONOMICAL_DARK_ALT, RISE_SET_ALT, moonAltitude, moonPhase, moonPosition, moonUpSpans, solarNoon, sunAltitude,
  sunCrossing, sunMoonSeparation,
} from './sky.ts';

const MADRID = { lat: 40, lon: -4 };
const MINUTE = 60_000;

describe('moonPosition', () => {
  it('matches the worked example in Meeus, chapter 47', () => {
    // 1992 April 12, 0h TD. The series is cut short, so it agrees to about 0.02°.
    const moon = moonPosition(Date.UTC(1992, 3, 12) - 70_000);
    expect(((((moon.lon * 180) / Math.PI) % 360) + 360) % 360).toBeCloseTo(133.16, 1);
    expect((moon.lat * 180) / Math.PI).toBeCloseTo(-3.229, 1);
    expect(Math.abs(moon.distanceKm - 368409.7)).toBeLessThan(150);
  });
});

describe('moonPhase', () => {
  it('matches reference fractions', () => {
    const golden: [number, number, boolean][] = [
      [Date.UTC(2027, 0, 2, 2), 0.2769, false],
      [Date.UTC(2027, 0, 5, 2), 0.0688, false],
      [Date.UTC(2027, 0, 8, 2), 0.0011, true],
      [Date.UTC(2027, 0, 15, 2), 0.4207, true],
      [Date.UTC(2027, 0, 20, 2), 0.9134, true],
      [Date.UTC(2028, 0, 1, 2), 0.1569, true],
    ];
    for (const [ms, fraction, waxing] of golden) {
      const phase = moonPhase(ms);
      expect(Math.abs(phase.fraction - fraction), new Date(ms).toISOString()).toBeLessThan(0.01);
      expect(phase.waxing).toBe(waxing);
    }
  });
});

describe('sunCrossing', () => {
  const at = (utc: number) => solarNoon(utc, MADRID.lon);

  it('finds sunrise and sunset to within two minutes', () => {
    // At 40° N on January 15 the day is 9 h 39 min long, centered on 12:25 UTC at 4° W.
    const jan = sunCrossing(at(Date.UTC(2027, 0, 15, 12)), MADRID, RISE_SET_ALT);
    if (typeof jan === 'string') throw new Error(jan);
    expect(Math.abs(jan.rise - Date.UTC(2027, 0, 15, 7, 36))).toBeLessThan(2 * MINUTE);
    expect(Math.abs(jan.set - Date.UTC(2027, 0, 15, 17, 15))).toBeLessThan(2 * MINUTE);
  });

  it('gives the longest and shortest day', () => {
    const hours = (utc: number) => {
      const day = sunCrossing(at(utc), MADRID, RISE_SET_ALT);
      return typeof day === 'string' ? NaN : (day.set - day.rise) / 3_600_000;
    };
    expect(hours(Date.UTC(2027, 5, 21, 12))).toBeCloseTo(15 + 1 / 60, 1);
    expect(hours(Date.UTC(2027, 11, 22, 12))).toBeCloseTo(9 + 20 / 60, 1);
  });

  it('returns times at which the Sun really is at that altitude', () => {
    const dark = sunCrossing(at(Date.UTC(2027, 3, 1, 12)), MADRID, ASTRONOMICAL_DARK_ALT);
    if (typeof dark === 'string') throw new Error(dark);
    expect(sunAltitude(dark.set, MADRID)).toBeCloseTo(-18, 1);
    expect(sunAltitude(dark.rise, MADRID)).toBeCloseTo(-18, 1);
  });

  it('reports days on which the Sun never crosses', () => {
    const north = { lat: 70, lon: 25 };
    const june = solarNoon(Date.UTC(2027, 5, 21, 10), north.lon);
    const december = solarNoon(Date.UTC(2027, 11, 21, 10), north.lon);
    expect(sunCrossing(june, north, RISE_SET_ALT)).toBe('above');
    expect(sunCrossing(december, north, RISE_SET_ALT)).toBe('below');
  });
});

describe('moonUpSpans', () => {
  it('splits the night at moonrise and moonset', () => {
    const from = Date.UTC(2027, 0, 15, 18);
    const to = Date.UTC(2027, 0, 16, 7);
    const spans = moonUpSpans(from, to, MADRID);
    expect(spans).toHaveLength(1);
    const [start, end] = spans[0]!;
    expect(start).toBe(from); // first quarter: already up at dusk
    expect(end).toBeLessThan(to);
    expect(moonAltitude(end, MADRID)).toBeCloseTo(0, 0);
  });

  it('returns nothing for an empty night', () => {
    expect(moonUpSpans(10, 10, MADRID)).toEqual([]);
  });
});

describe('sunMoonSeparation', () => {
  it('is smaller than the two radii during an eclipse seen from that place', () => {
    // April 8 2024: total near Cleveland at about 19:15 UTC.
    expect(sunMoonSeparation(Date.UTC(2024, 3, 8, 19, 15), { lat: 41.5, lon: -81.7 })).toBeLessThan(0.06);
    // The same moment from Brazil, far off the path.
    expect(sunMoonSeparation(Date.UTC(2024, 3, 8, 19, 15), { lat: -15, lon: -48 })).toBeGreaterThan(0.6);
  });
});
