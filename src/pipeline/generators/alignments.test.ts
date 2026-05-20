import { describe, it, expect } from 'vitest';
import { filterByYear, formatDate, entryToEvent } from './alignments.ts';

const SAMPLE_ENTRIES = [
  {
    start: '2026-11-01',
    end: '2026-12-15',
    type: 'mars-launch-window' as const,
    title: 'Mars Launch Window',
    description: 'Test.',
    url: 'https://example.com',
  },
  {
    start: '2026-04-15',
    end: '2026-05-10',
    type: 'planet-parade' as const,
    title: 'Planet Parade',
    description: 'Test.',
    url: 'https://example.com',
  },
  {
    start: '2029-01-01',
    end: '2029-02-15',
    type: 'mars-launch-window' as const,
    title: 'Mars Launch Window 2029',
    description: 'Test.',
    url: 'https://example.com',
  },
];

describe('filterByYear', () => {
  it('returns entries whose date range includes the given year', () => {
    const result = filterByYear(SAMPLE_ENTRIES, 2026);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.title)).toContain('Mars Launch Window');
    expect(result.map((e) => e.title)).toContain('Planet Parade');
  });

  it('returns 2029 entry when year is 2029', () => {
    const result = filterByYear(SAMPLE_ENTRIES, 2029);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Mars Launch Window 2029');
  });

  it('returns empty array for a year with no entries', () => {
    expect(filterByYear(SAMPLE_ENTRIES, 2030)).toHaveLength(0);
  });

  it('includes entries that span across a year boundary', () => {
    const crossYear = [
      {
        start: '2025-12-01',
        end: '2026-01-15',
        type: 'mars-launch-window' as const,
        title: 'Cross-year window',
        description: '',
        url: '',
      },
    ];
    // Should appear in both 2025 and 2026
    expect(filterByYear(crossYear, 2025)).toHaveLength(1);
    expect(filterByYear(crossYear, 2026)).toHaveLength(1);
    expect(filterByYear(crossYear, 2027)).toHaveLength(0);
  });
});

describe('formatDate', () => {
  it('formats a date string as Month D, YYYY', () => {
    expect(formatDate('2026-11-01')).toBe('November 1, 2026');
    expect(formatDate('2029-01-15')).toBe('January 15, 2029');
  });
});

describe('entryToEvent', () => {
  it('collapses mars-launch-window to a single day', () => {
    const event = entryToEvent({
      start: '2026-11-01',
      end: '2026-12-15',
      type: 'mars-launch-window',
      title: 'Mars Launch Window',
      description: 'Details here.',
      url: 'https://example.com',
    });
    expect(event.start).toBe('2026-11-01');
    expect(event.end).toBe('2026-11-02');
  });

  it('prepends window date range to mars-launch-window description', () => {
    const event = entryToEvent({
      start: '2026-11-01',
      end: '2026-12-15',
      type: 'mars-launch-window',
      title: 'Mars Launch Window',
      description: 'Details here.',
      url: 'https://example.com',
    });
    expect(event.description).toMatch(/^Launch window: November 1, 2026 – December 15, 2026\n\n/);
    expect(event.description).toContain('Details here.');
  });

  it('preserves full date range for planet-parade', () => {
    const event = entryToEvent({
      start: '2026-04-15',
      end: '2026-05-10',
      type: 'planet-parade',
      title: 'Planet Parade',
      description: 'Details here.',
      url: 'https://example.com',
    });
    expect(event.start).toBe('2026-04-15');
    expect(event.end).toBe('2026-05-10');
    expect(event.description).toBe('Details here.');
  });
});
