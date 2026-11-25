/**
 * Integration test: asserts that JPL Horizons still answers in the shape sun-moon.ts reads,
 * and that the results agree with independently published times.
 */
import { describe, it, expect } from 'vitest';
import { fetchMoonPhases, fetchSeasons } from './sun-moon.ts';

/** US Naval Observatory times for 2027, as the calendar published them before this client. */
const PUBLISHED_PHASES = [
  ['New Moon', '2027-01-07T20:24Z'], ['Full Moon', '2027-01-22T12:17Z'], ['Full Moon', '2027-06-19T00:44Z'],
  ['New Moon', '2027-08-31T17:41Z'], ['Full Moon', '2027-09-15T23:03Z'],
] as const;
const PUBLISHED_SEASONS = [
  ['Equinox', '2027-03-20T20:25Z'], ['Solstice', '2027-06-21T14:11Z'], ['Equinox', '2027-09-23T06:02Z'],
] as const;

const ms = (m: { year: number; month: number; day: number; time: string }) =>
  Date.parse(`${m.year}-${String(m.month).padStart(2, '0')}-${String(m.day).padStart(2, '0')}T${m.time}Z`);
const TWO_MINUTES = 120_000;

describe('JPL Sun and Moon positions (real)', () => {
  it('reproduce published moon phases', async () => {
    const phases = await fetchMoonPhases(2027);
    expect(phases).toHaveLength(49);
    for (const [phase, time] of PUBLISHED_PHASES) {
      const near = phases.find((p) => Math.abs(ms(p) - Date.parse(time)) <= TWO_MINUTES);
      expect(near?.phase, time).toBe(phase);
    }
  });

  it('reproduce published seasons', async () => {
    const seasons = await fetchSeasons(2027);
    expect(seasons).toHaveLength(4);
    for (const [phenom, time] of PUBLISHED_SEASONS) {
      const near = seasons.find((s) => Math.abs(ms(s) - Date.parse(time)) <= TWO_MINUTES);
      expect(near?.phenom, time).toBe(phenom);
    }
  });
});
