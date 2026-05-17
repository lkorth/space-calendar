/**
 * Integration test: asserts the real NASA lunar eclipse catalog matches
 * our parser assumptions.
 *
 * If this test fails, update fetchLunarEclipses() in nasa.ts AND update
 * the mock catalog lines in nasa.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { fetchLunarEclipses } from './nasa.ts';

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
    expect(entry.greatest).toMatch(/^\d{2}:\d{2}$/); // HH:MM
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
      const greatest = new Date(
        `${eclipse.year}-${String(eclipse.month).padStart(2, '0')}-${String(eclipse.day).padStart(2, '0')}T${eclipse.greatest}:00Z`,
      ).getTime();
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
