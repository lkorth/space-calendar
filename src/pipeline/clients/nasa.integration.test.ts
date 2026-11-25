/**
 * Integration test: asserts the real NASA lunar eclipse catalog matches
 * our parser assumptions.
 *
 * If this test fails, update fetchLunarEclipses() in nasa.ts AND update
 * the mock catalog lines in nasa.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { fetchLunarEclipses, fetchSolarEclipses } from './nasa.ts';

describe('NASA lunar eclipse catalog (real)', () => {
  it('returns an array for the current year', async () => {
    const year = new Date().getFullYear();
    const eclipses = await fetchLunarEclipses(year);
    expect(Array.isArray(eclipses)).toBe(true);
  });

  it('parsed entries have correct field types', async () => {
    // Use a year we know has eclipses
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses.length).toBeGreaterThan(0);

    const entry = eclipses[0]!;
    expect(typeof entry.year).toBe('number');
    expect(typeof entry.month).toBe('number');
    expect(typeof entry.day).toBe('number');
    expect(typeof entry.greatest).toBe('string');
    expect(entry.greatest).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
    expect(['Total', 'Partial', 'Penumbral']).toContain(entry.type);
    expect(typeof entry.penumbralDuration).toBe('number');
    expect(entry.penumbralDuration).toBeGreaterThan(0);
    expect(typeof entry.p1).toBe('string');
    expect(typeof entry.p4).toBe('string');
    expect(typeof entry.geoLng).toBe('number');
  });

  it('p1 is before greatest eclipse and p4 is after', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    for (const eclipse of eclipses) {
      const p1 = new Date(eclipse.p1).getTime();
      const p4 = new Date(eclipse.p4).getTime();
      const greatest = new Date(eclipse.greatest).getTime();
      expect(p1).toBeLessThan(greatest);
      expect(p4).toBeGreaterThan(greatest);
    }
  });

  it('2026 has the expected eclipses (Mar 3 total, Aug 28 partial)', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses).toHaveLength(2);
    expect(eclipses[0]).toMatchObject({ month: 3, day: 3, type: 'Total' });
    expect(eclipses[1]).toMatchObject({ month: 8, day: 28, type: 'Partial' });
  });
});

describe('NASA lunar eclipse times (real)', () => {
  it('agree with JPL positions to the minute', async () => {
    // When the Moon is nearest the center of Earth's shadow, from JPL Horizons.
    const jpl = { '2026-03-03': '11:33:42', '2026-08-28': '04:12:55' };
    for (const eclipse of await fetchLunarEclipses(2026)) {
      const date = eclipse.greatest.slice(0, 10) as keyof typeof jpl;
      const difference = Date.parse(eclipse.greatest) - Date.parse(`${date}T${jpl[date]}Z`);
      expect(Math.abs(difference), date).toBeLessThanOrEqual(40_000);
    }
  });
});

describe('NASA solar eclipse catalog (real)', () => {
  it('lists the solar eclipses of 2027', async () => {
    expect(await fetchSolarEclipses(2027)).toEqual([
      { year: 2027, month: 2, day: 6, type: 'Annular' },
      { year: 2027, month: 8, day: 2, type: 'Total' },
    ]);
  });
});
