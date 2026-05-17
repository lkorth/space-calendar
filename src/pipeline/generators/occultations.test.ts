import { describe, it, expect } from 'vitest';
import { buildOccultationTitle, filterByYear } from './occultations.ts';

const SAMPLE_ENTRIES = [
  {
    date: '2026-02-02',
    target: 'Regulus',
    type: 'star' as const,
    magnitude: 1.4,
    visibility: 'Eastern North America',
    disappear: '08:45',
    reappear: '09:40',
    description: 'Test description.',
    url: 'https://example.com',
  },
  {
    date: '2026-06-17',
    target: 'Venus',
    type: 'planet' as const,
    magnitude: -4.5,
    visibility: 'US, Canada',
    disappear: '20:10',
    reappear: '21:05',
    description: 'Test description.',
    url: 'https://example.com',
  },
  {
    date: '2027-01-13',
    target: 'Mars',
    type: 'planet' as const,
    magnitude: -1.1,
    visibility: 'Europe',
    disappear: '22:50',
    reappear: '23:45',
    description: 'Test description.',
    url: 'https://example.com',
  },
];

describe('buildOccultationTitle', () => {
  it('formats a planet occultation title', () => {
    expect(buildOccultationTitle('Venus')).toBe('Lunar Occultation — Moon covers Venus');
  });

  it('formats a star occultation title', () => {
    expect(buildOccultationTitle('Regulus')).toBe('Lunar Occultation — Moon covers Regulus');
  });

  it('formats a Jupiter occultation title', () => {
    expect(buildOccultationTitle('Jupiter')).toBe('Lunar Occultation — Moon covers Jupiter');
  });
});

describe('filterByYear', () => {
  it('returns only entries matching the requested year', () => {
    const result = filterByYear(SAMPLE_ENTRIES, 2026);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.date.startsWith('2026'))).toBe(true);
  });

  it('returns 2027 entries when year is 2027', () => {
    const result = filterByYear(SAMPLE_ENTRIES, 2027);
    expect(result).toHaveLength(1);
    expect(result[0]!.target).toBe('Mars');
  });

  it('returns empty array when no entries match the year', () => {
    expect(filterByYear(SAMPLE_ENTRIES, 2030)).toHaveLength(0);
  });

  it('returns all entries when all match the year', () => {
    const only2026 = SAMPLE_ENTRIES.filter((e) => e.date.startsWith('2026'));
    expect(filterByYear(only2026, 2026)).toHaveLength(2);
  });
});
