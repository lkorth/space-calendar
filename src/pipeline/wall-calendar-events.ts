import { WALL_CALENDAR_CATEGORIES } from '../shared/wall-calendar/events.ts';
import type { CalendarEvent } from '../shared/models.ts';

/** The calendar years a wall calendar can be made for: this one and the next. */
export function wallCalendarYears(today: Date): number[] {
  return [today.getUTCFullYear(), today.getUTCFullYear() + 1];
}

/** Events for the wall calendars. A wall calendar needs a whole calendar year, which the feed's
 *  rolling window rarely holds, so these are kept beside the feed's data rather than in it.
 *  Descriptions are dropped: a wall calendar does not print them, and they are most of the size. */
export function selectWallCalendarEvents(events: readonly CalendarEvent[], years: readonly number[]): CalendarEvent[] {
  const byUid = new Map(
    events
      .filter((e) => WALL_CALENDAR_CATEGORIES.includes(e.category) && years.includes(new Date(e.start).getUTCFullYear()))
      .map((e): [string, CalendarEvent] => {
        const { pathLocations: _pathLocations, url: _url, ...rest } = e;
        return [e.uid, { ...rest, description: '' }];
      }),
  );
  return [...byUid.values()].sort((a, b) => a.start.localeCompare(b.start));
}
