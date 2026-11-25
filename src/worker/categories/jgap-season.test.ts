import { describe, it, expect } from 'vitest';
import { jgapInSeason } from './jgap-season.ts';

const at = (iso: string) => jgapInSeason(new Date(iso));

describe('jgapInSeason', () => {
  it('opens on March 1', () => {
    expect(at('2027-02-28T23:59:59Z')).toBe(false);
    expect(at('2027-03-01T00:00:00Z')).toBe(true);
    expect(at('2028-02-29T12:00:00Z')).toBe(false);
  });

  it('covers the summer', () => {
    expect(at('2026-07-15T12:00:00Z')).toBe(true);
  });

  it('closes on the Saturday before Thanksgiving', () => {
    // Thanksgiving 2026 is November 26; the last program was Saturday, November 21.
    expect(at('2026-11-20T23:59:59Z')).toBe(true);
    expect(at('2026-11-21T00:00:00Z')).toBe(false);
  });

  it('follows Thanksgiving to its earliest and latest dates', () => {
    // November 22, 2029 and November 28, 2030.
    expect(at('2029-11-16T12:00:00Z')).toBe(true);
    expect(at('2029-11-17T12:00:00Z')).toBe(false);
    expect(at('2030-11-22T12:00:00Z')).toBe(true);
    expect(at('2030-11-23T12:00:00Z')).toBe(false);
  });

  it('stays closed through the winter', () => {
    expect(at('2026-12-25T12:00:00Z')).toBe(false);
    expect(at('2027-01-01T00:00:00Z')).toBe(false);
  });
});
