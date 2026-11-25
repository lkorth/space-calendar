import { describe, it, expect } from 'vitest';
import { LocalClock, formatDay } from './clock.ts';
import { daysOfYear, milkyWay, nights, sunDays } from './year-sky.ts';

const OHIO = { lat: 40, lon: -83 };
const clock = new LocalClock('America/New_York');
const days = daysOfYear(2027);

describe('daysOfYear', () => {
  it('knows leap years', () => {
    expect(daysOfYear(2027)).toHaveLength(365);
    expect(daysOfYear(2028)).toHaveLength(366);
  });
});

describe('nights', () => {
  it('runs from sunset to the next sunrise in clock hours', () => {
    const all = nights(days, sunDays(days, clock, OHIO), clock, OHIO);
    const jan15 = all[14]!;
    expect(jan15.sunset).toBeCloseTo(17.53, 1);
    expect(jan15.sunrise).toBeCloseTo(31.87, 1);
    expect(jan15.dusk!).toBeGreaterThan(jan15.sunset);
    expect(jan15.dawn!).toBeLessThan(jan15.sunrise);
    for (const night of all) {
      for (const [a, b] of night.moonUp) {
        expect(a).toBeGreaterThanOrEqual(night.sunset - 0.01);
        expect(b).toBeLessThanOrEqual(night.sunrise + 0.01);
      }
    }
  });

  it('is empty under the midnight sun and unbroken in polar night', () => {
    const place = { lat: 70, lon: 25 };
    const oslo = new LocalClock('Europe/Oslo');
    const all = nights(days, sunDays(days, oslo, place), oslo, place);
    const june = all[171]!;
    expect(june.sunrise - june.sunset).toBeCloseTo(0, 1);
    expect(june.dusk).toBeNull();
    expect(june.moonUp).toEqual([]);
    const december = all[354]!;
    expect(december.sunrise - december.sunset).toBeCloseTo(24, 1);
  });

  it('gives summer nights at 55° N a sunset but no full darkness', () => {
    const place = { lat: 55, lon: -3 };
    const london = new LocalClock('Europe/London');
    const june = nights(days, sunDays(days, london, place), london, place)[171]!;
    expect(june.sunset).toBeGreaterThan(21);
    expect(june.dusk).toBeNull();
  });
});

describe('milkyWay', () => {
  it('finds the same windows as the calendar feed and drops lone nights', () => {
    const { hours, best } = milkyWay(days, clock, OHIO);
    const starts = hours.flatMap((h, i) => (h > 0 && !hours[i - 1] ? [formatDay(days[i]!)] : []));
    const ends = hours.flatMap((h, i) => (h > 0 && !hours[i + 1] ? [formatDay(days[i]!)] : []));
    // Within a night of the mockup, which sampled a finer Moon every five minutes.
    expect(starts).toEqual(['MAY 2', 'MAY 29', 'JUN 26', 'JUL 26']);
    expect(ends).toEqual(['MAY 14', 'JUN 12', 'JUL 10', 'AUG 6']);
    expect(best).not.toBeNull();
  });

  it('finds none where the core never rises high enough', () => {
    expect(milkyWay(days, new LocalClock('Europe/Oslo'), { lat: 60, lon: 10 }).best).toBeNull();
  });

  it('fills the one night a year that the scan skips', () => {
    const places = [
      { lat: -34, lon: 151, tz: 'Australia/Sydney', year: 2026, skipped: 'JUL 18' },
      { lat: 33, lon: -112, tz: 'America/Phoenix', year: 2027, skipped: 'APR 9' },
    ];
    for (const { lat, lon, tz, year, skipped } of places) {
      const all = daysOfYear(year);
      const { hours } = milkyWay(all, new LocalClock(tz), { lat, lon });
      expect(hours[all.findIndex((d) => formatDay(d) === skipped)], tz).toBeGreaterThan(2);
    }
  });

  it('covers the southern season', () => {
    const { hours } = milkyWay(days, new LocalClock('Australia/Sydney'), { lat: -34, lon: 151 });
    expect(hours.filter((h) => h > 0).length).toBeGreaterThan(150);
  });
});
