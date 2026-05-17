/**
 * Integration test: asserts real JPL API response shapes match our parsers.
 *
 * If this test fails, update the relevant client in jpl.ts AND update
 * any affected unit test mocks.
 */
import { describe, it, expect } from 'vitest';
import { fetchCloseApproaches } from './jpl.ts';
import { fetchPlanetaryEvents } from './jpl.ts';

const YEAR = new Date().getFullYear();

describe('JPL CAD close approach API (real)', () => {
  it('returns an array', async () => {
    const approaches = await fetchCloseApproaches(YEAR);
    expect(Array.isArray(approaches)).toBe(true);
  });

  it('each entry has des, cd, dist_au, dist_ld, v_rel_kms, h as numbers', async () => {
    const approaches = await fetchCloseApproaches(YEAR);
    if (approaches.length === 0) return;
    const entry = approaches[0]!;
    expect(typeof entry.des).toBe('string');
    expect(typeof entry.cd).toBe('string');
    expect(typeof entry.dist_au).toBe('number');
    expect(typeof entry.dist_ld).toBe('number');
    expect(typeof entry.v_rel_kms).toBe('number');
    expect(typeof entry.h).toBe('number');
  });
});

describe('JPL Horizons planetary events (real)', () => {
  it('returns an array of events', async () => {
    const events = await fetchPlanetaryEvents(YEAR);
    expect(Array.isArray(events)).toBe(true);
  });

  it('each event has name, date, type, elongation fields', async () => {
    const events = await fetchPlanetaryEvents(YEAR);
    if (events.length === 0) return;
    const event = events[0]!;
    expect(typeof event.name).toBe('string');
    expect(typeof event.date).toBe('string');
    expect(['opposition', 'greatest-elongation-east', 'greatest-elongation-west']).toContain(event.type);
    expect(typeof event.elongation).toBe('number');
  });

  it('opposition elongation values are near 180°', async () => {
    const events = await fetchPlanetaryEvents(YEAR);
    const oppositions = events.filter((e) => e.type === 'opposition');
    for (const opp of oppositions) {
      expect(opp.elongation).toBeGreaterThan(170);
    }
  });

  it('dates are formatted as YYYY-MM-DD', async () => {
    const events = await fetchPlanetaryEvents(YEAR);
    if (events.length === 0) return;
    expect(events[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
