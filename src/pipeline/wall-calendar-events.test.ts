import { describe, it, expect } from 'vitest';
import type { CalendarEvent, CategorySlug } from '../shared/models.ts';
import { wallCalendarYears, selectWallCalendarEvents } from './wall-calendar-events.ts';

const event = (uid: string, category: CategorySlug, start: string): CalendarEvent => ({
  uid, category, start, end: start, title: 't', allDay: true, description: 'long text', url: 'https://example.com',
});

describe('wallCalendarYears', () => {
  it('covers this calendar year and the next', () => {
    expect(wallCalendarYears(new Date('2026-11-25T00:00:00Z'))).toEqual([2026, 2027]);
  });
});

describe('selectWallCalendarEvents', () => {
  it('keeps whole years of the wall calendar categories, once each and in order', () => {
    const picked = selectWallCalendarEvents(
      [
        event('late', 'moon-phases', '2027-12-28'),
        event('early', 'moon-phases', '2026-01-03'),
        event('early', 'moon-phases', '2026-01-03'),
        event('outside', 'moon-phases', '2028-01-01'),
        event('launch', 'launches', '2027-01-01'),
      ],
      [2026, 2027],
    );
    expect(picked.map((e) => e.uid)).toEqual(['early', 'late']);
  });

  it('drops text a wall calendar does not print', () => {
    const [picked] = selectWallCalendarEvents([event('a', 'oppositions', '2027-02-11')], [2027]);
    expect(picked!.description).toBe('');
    expect(picked!.url).toBeUndefined();
  });
});
