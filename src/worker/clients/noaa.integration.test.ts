/**
 * Integration test: asserts the real NOAA SWPC API response matches
 * the shape our client parses and our unit test mocks assume.
 *
 * If this test fails, update fetchKpForecast() in noaa.ts AND update
 * the mock data in noaa.test.ts and aurora.test.ts to match.
 */
import { describe, it, expect } from 'vitest';
import { fetchKpForecast } from './noaa.ts';

describe('NOAA SWPC Kp forecast API (real)', () => {
  it('returns a non-empty array', async () => {
    const entries = await fetchKpForecast();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('each entry has a string time_tag', async () => {
    const entries = await fetchKpForecast();
    for (const entry of entries) {
      expect(typeof entry.time_tag).toBe('string');
      expect(entry.time_tag.length).toBeGreaterThan(0);
    }
  });

  it('each entry has a numeric kp value between 0 and 9', async () => {
    const entries = await fetchKpForecast();
    for (const entry of entries) {
      expect(typeof entry.kp).toBe('number');
      expect(entry.kp).toBeGreaterThanOrEqual(0);
      expect(entry.kp).toBeLessThanOrEqual(9);
    }
  });

  it('each entry has an observed field matching expected values', async () => {
    const entries = await fetchKpForecast();
    const valid = ['observed', 'estimated', 'predicted'];
    for (const entry of entries) {
      expect(valid).toContain(entry.observed);
    }
  });
});
