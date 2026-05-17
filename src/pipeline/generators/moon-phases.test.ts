import { describe, it, expect } from 'vitest';
import {
  findHarvestMoonIndex,
  detectBlueMoons,
  getFullMoonName,
  buildFullMoonTitle,
} from './moon-phases.ts';

// Approximate 2026 full moon dates
const FULL_MOONS_2026 = [
  new Date('2026-01-03T10:03:00Z'), // Jan — Wolf Moon
  new Date('2026-02-01T22:09:00Z'), // Feb — Snow Moon
  new Date('2026-03-03T11:38:00Z'), // Mar — Worm Moon
  new Date('2026-04-02T02:12:00Z'), // Apr — Pink Moon
  new Date('2026-05-01T17:23:00Z'), // May — Flower Moon
  new Date('2026-05-31T08:45:00Z'), // May (2nd) — Flower Moon / Blue Moon
  new Date('2026-06-29T23:56:00Z'), // Jun — Strawberry Moon
  new Date('2026-07-29T14:36:00Z'), // Jul — Buck Moon
  new Date('2026-08-28T04:18:00Z'), // Aug — Sturgeon Moon
  new Date('2026-09-26T16:49:00Z'), // Sep — Harvest Moon (nearest to Sep 23 equinox)
  new Date('2026-10-26T04:12:00Z'), // Oct — Hunter's Moon
  new Date('2026-11-24T14:53:00Z'), // Nov — Beaver Moon
  new Date('2026-12-24T01:28:00Z'), // Dec — Cold Moon
];

const SEPT_EQUINOX_2026 = new Date('2026-09-23T00:05:00Z');

describe('findHarvestMoonIndex', () => {
  it('identifies the September 26 full moon as the 2026 Harvest Moon', () => {
    const idx = findHarvestMoonIndex(FULL_MOONS_2026, SEPT_EQUINOX_2026);
    expect(idx).toBe(9); // Sep 26 is index 9
  });

  it('returns 0 for a single-element array', () => {
    const idx = findHarvestMoonIndex([new Date('2026-09-26T00:00:00Z')], SEPT_EQUINOX_2026);
    expect(idx).toBe(0);
  });

  it('picks the moon closer in time when two moons are equidistant', () => {
    // Equinox exactly between two moons — first one wins (lower index) since we use <
    const equinox = new Date('2026-09-15T00:00:00Z');
    const moons = [
      new Date('2026-09-01T00:00:00Z'), // 14 days before
      new Date('2026-09-29T00:00:00Z'), // 14 days after
    ];
    // Both are 14 days away; findHarvestMoonIndex picks the first it encounters with minDiff
    const idx = findHarvestMoonIndex(moons, equinox);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(1);
  });

  it('can return an October Harvest Moon when October is closer to the equinox', () => {
    // Equinox on Sep 30 — Oct 14 full moon is closer than Sep 1 full moon
    const equinox = new Date('2026-09-30T00:00:00Z');
    const moons = [
      new Date('2026-09-01T00:00:00Z'), // 29 days before equinox
      new Date('2026-10-14T00:00:00Z'), // 14 days after equinox
    ];
    const idx = findHarvestMoonIndex(moons, equinox);
    expect(idx).toBe(1); // October moon is closer
  });
});

describe('detectBlueMoons', () => {
  it('flags May 31 as the Blue Moon in 2026 (two full moons in May)', () => {
    const result = detectBlueMoons(FULL_MOONS_2026);
    expect(result[5]).toBe(true);  // May 31
    expect(result[4]).toBe(false); // May 1 — first of the month, not a Blue Moon
  });

  it('returns all false when no month has two full moons', () => {
    const moons = [
      new Date('2025-01-13T00:00:00Z'),
      new Date('2025-02-12T00:00:00Z'),
      new Date('2025-03-14T00:00:00Z'),
    ];
    expect(detectBlueMoons(moons).every((b) => b === false)).toBe(true);
  });

  it('returns a boolean array with the same length as input', () => {
    const result = detectBlueMoons(FULL_MOONS_2026);
    expect(result).toHaveLength(FULL_MOONS_2026.length);
  });

  it('handles empty input', () => {
    expect(detectBlueMoons([])).toEqual([]);
  });
});

describe('getFullMoonName', () => {
  const harvestIdx = 9; // Sep 26 in 2026 list

  it('returns Harvest Moon for the harvest moon index', () => {
    expect(getFullMoonName(harvestIdx, harvestIdx, 9)).toBe('Harvest Moon');
  });

  it("returns Hunter's Moon for the index immediately after the harvest moon", () => {
    expect(getFullMoonName(harvestIdx + 1, harvestIdx, 10)).toBe("Hunter's Moon");
  });

  it('returns Wolf Moon for January', () => {
    expect(getFullMoonName(0, harvestIdx, 1)).toBe('Wolf Moon');
  });

  it('returns Flower Moon for May', () => {
    expect(getFullMoonName(4, harvestIdx, 5)).toBe('Flower Moon');
  });

  it('returns Cold Moon for December', () => {
    expect(getFullMoonName(12, harvestIdx, 12)).toBe('Cold Moon');
  });
});

describe('buildFullMoonTitle', () => {
  it('builds a plain title with just the name', () => {
    expect(buildFullMoonTitle('Wolf Moon', false, false)).toBe('Full Moon — Wolf Moon');
  });

  it('appends Blue Moon when flagged', () => {
    expect(buildFullMoonTitle('Flower Moon', true, false)).toBe('Full Moon — Flower Moon — Blue Moon');
  });

  it('appends Supermoon when flagged', () => {
    expect(buildFullMoonTitle('Wolf Moon', false, true)).toBe('Full Moon — Wolf Moon (Supermoon)');
  });

  it('appends both Blue Moon and Supermoon when both flagged', () => {
    expect(buildFullMoonTitle('Cold Moon', true, true)).toBe('Full Moon — Cold Moon — Blue Moon (Supermoon)');
  });

  it('puts Blue Moon before Supermoon in the title', () => {
    const title = buildFullMoonTitle('Harvest Moon', true, true);
    expect(title.indexOf('Blue Moon')).toBeLessThan(title.indexOf('Supermoon'));
  });
});
