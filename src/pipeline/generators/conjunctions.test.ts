import { describe, it, expect } from 'vitest';
import { buildConjunctionTitle, formatMag, filterByYear } from './conjunctions.ts';

const SAMPLE_ENTRIES = [
  {
    date: '2026-03-08',
    bodies: ['Venus', 'Saturn'] as [string, string],
    separation: 0.9,
    sky: 'evening' as const,
    look: 'Look west 45 min after sunset',
    mag1: -4.1,
    mag2: 1.2,
    description: 'Test description.',
    url: 'https://example.com',
  },
  {
    date: '2026-06-09',
    bodies: ['Venus', 'Jupiter'] as [string, string],
    separation: 1.6,
    sky: 'evening' as const,
    look: 'Look west after sunset',
    mag1: -4.5,
    mag2: -2.0,
    description: 'Test description.',
    url: 'https://example.com',
  },
  {
    date: '2027-07-01',
    bodies: ['Venus', 'Jupiter'] as [string, string],
    separation: 3.5,
    sky: 'morning' as const,
    look: 'Look east before dawn',
    mag1: -4.0,
    mag2: -2.1,
    description: 'Test description.',
    url: 'https://example.com',
  },
];

describe('buildConjunctionTitle', () => {
  it('includes both planet names', () => {
    const title = buildConjunctionTitle(['Venus', 'Jupiter'], 1.6);
    expect(title).toContain('Venus');
    expect(title).toContain('Jupiter');
  });

  it('includes the separation in degrees', () => {
    const title = buildConjunctionTitle(['Venus', 'Jupiter'], 1.6);
    expect(title).toContain('1.6°');
  });

  it('formats separation to one decimal place', () => {
    const title = buildConjunctionTitle(['Mars', 'Saturn'], 0.9);
    expect(title).toContain('0.9°');
  });

  it('contains "Planetary Conjunction" label', () => {
    expect(buildConjunctionTitle(['Venus', 'Saturn'], 0.9)).toContain('Planetary Conjunction');
  });
});

describe('formatMag', () => {
  it('formats negative magnitude with minus sign', () => {
    expect(formatMag(-4.5)).toBe('−4.5');
  });

  it('formats positive magnitude with plus sign', () => {
    expect(formatMag(1.2)).toBe('+1.2');
  });

  it('formats zero as +0.0', () => {
    expect(formatMag(0)).toBe('+0.0');
  });

  it('preserves one decimal place', () => {
    expect(formatMag(-2.0)).toBe('−2.0');
    expect(formatMag(0.5)).toBe('+0.5');
  });
});

describe('filterByYear', () => {
  it('returns only entries for the given year', () => {
    const result = filterByYear(SAMPLE_ENTRIES, 2026);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.date.startsWith('2026'))).toBe(true);
  });

  it('returns 2027 entries when year is 2027', () => {
    const result = filterByYear(SAMPLE_ENTRIES, 2027);
    expect(result).toHaveLength(1);
    expect(result[0]!.bodies[1]).toBe('Jupiter');
  });

  it('returns empty array for a year with no entries', () => {
    expect(filterByYear(SAMPLE_ENTRIES, 2030)).toHaveLength(0);
  });
});
