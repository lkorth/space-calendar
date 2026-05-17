/**
 * Integration test: asserts the real USNO API response shapes match
 * our client interfaces and unit test mocks.
 *
 * If this test fails, update the relevant client interface in usno.ts
 * AND update any affected unit test mocks.
 */
import { describe, it, expect } from 'vitest';
import { usno } from './usno.ts';

const YEAR = new Date().getFullYear();

describe('USNO moon phases API (real)', () => {
  it('returns phasedata array', async () => {
    const data = await usno.moonPhases(YEAR);
    expect(Array.isArray(data.phasedata)).toBe(true);
    expect(data.phasedata.length).toBeGreaterThan(0);
  });

  it('each phase entry has a numeric day field (not phaseday)', async () => {
    const data = await usno.moonPhases(YEAR);
    const entry = data.phasedata[0]!;
    expect(typeof entry.day).toBe('number');
    expect((entry as Record<string, unknown>)['phaseday']).toBeUndefined();
  });

  it('each phase entry has month, year, phase, time fields', async () => {
    const data = await usno.moonPhases(YEAR);
    const entry = data.phasedata[0]!;
    expect(typeof entry.month).toBe('number');
    expect(typeof entry.year).toBe('number');
    expect(typeof entry.phase).toBe('string');
    expect(typeof entry.time).toBe('string');
  });
});

describe('USNO seasons API (real)', () => {
  it('returns data array', async () => {
    const data = await usno.seasons(YEAR);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
  });

  it('phenom is "Equinox" or "Solstice" or "Perihelion" or "Aphelion" — not the full name', async () => {
    const data = await usno.seasons(YEAR);
    const valid = ['Equinox', 'Solstice', 'Perihelion', 'Aphelion'];
    for (const entry of data.data) {
      expect(valid).toContain(entry.phenom);
    }
  });

  it('each season entry has numeric day and month', async () => {
    const data = await usno.seasons(YEAR);
    const entry = data.data[0]!;
    expect(typeof entry.day).toBe('number');
    expect(typeof entry.month).toBe('number');
    expect(typeof entry.time).toBe('string');
  });
});

describe('USNO solar eclipses API (real)', () => {
  it('returns eclipses_in_year array', async () => {
    const data = await usno.solarEclipses(YEAR);
    expect(Array.isArray(data.eclipses_in_year)).toBe(true);
  });

  it('eclipse entries have day, month, year, event — but no time or region field', async () => {
    const data = await usno.solarEclipses(YEAR);
    if (data.eclipses_in_year.length === 0) return; // no eclipses this year
    const entry = data.eclipses_in_year[0]!;
    expect(typeof entry.day).toBe('number');
    expect(typeof entry.month).toBe('number');
    expect(typeof entry.year).toBe('number');
    expect(typeof entry.event).toBe('string');
    expect((entry as Record<string, unknown>)['time']).toBeUndefined();
    expect((entry as Record<string, unknown>)['region']).toBeUndefined();
  });
});
