import { describe, it, expect } from 'vitest';
import { buildICS } from './ics.ts';
import type { CalendarEvent } from '../shared/models.ts';

const timedEvent: CalendarEvent = {
  uid: 'test-timed@space-calendar',
  title: 'Total Lunar Eclipse — Blood Moon',
  start: '2026-03-03T08:45:00Z',
  end: '2026-03-03T14:23:00Z',
  allDay: false,
  description: 'A total lunar eclipse is visible tonight.',
  url: 'https://science.nasa.gov/eclipses/',
  category: 'eclipses-lunar',
};

const allDayEvent: CalendarEvent = {
  uid: 'test-allday@space-calendar',
  title: 'Jupiter at Opposition',
  start: '2026-01-10',
  end: '2026-01-11',
  allDay: true,
  description: 'Jupiter is at opposition.',
  url: 'https://solarsystem.nasa.gov/',
  category: 'oppositions',
};

const specialCharsEvent: CalendarEvent = {
  uid: 'test-special@space-calendar',
  title: 'Event with, commas; and \\backslashes',
  start: '2026-06-01',
  end: '2026-06-02',
  allDay: true,
  description: 'Line one\nLine two',
  category: 'meteor-showers',
};

describe('buildICS', () => {
  it('uses CRLF line endings throughout', () => {
    const ics = buildICS([timedEvent], 'Test');
    const lines = ics.split('\r\n');
    expect(lines.length).toBeGreaterThan(5);
    // No bare LF
    expect(ics).not.toMatch(/(?<!\r)\n/);
  });

  it('wraps with BEGIN/END VCALENDAR', () => {
    const ics = buildICS([timedEvent], 'Test');
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });

  it('wraps events with BEGIN/END VEVENT', () => {
    const ics = buildICS([timedEvent], 'Test');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('END:VEVENT\r\n');
  });

  it('formats timed event DTSTART as UTC datetime', () => {
    const ics = buildICS([timedEvent], 'Test');
    expect(ics).toContain('DTSTART:20260303T084500Z');
  });

  it('formats timed event DTEND as UTC datetime', () => {
    const ics = buildICS([timedEvent], 'Test');
    expect(ics).toContain('DTEND:20260303T142300Z');
  });

  it('formats all-day event DTSTART with VALUE=DATE', () => {
    const ics = buildICS([allDayEvent], 'Test');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260110');
  });

  it('formats all-day event DTEND with VALUE=DATE', () => {
    const ics = buildICS([allDayEvent], 'Test');
    expect(ics).toContain('DTEND;VALUE=DATE:20260111');
  });

  it('includes the UID', () => {
    const ics = buildICS([timedEvent], 'Test');
    expect(ics).toContain('UID:test-timed@space-calendar');
  });

  it('includes the URL when present', () => {
    const ics = buildICS([timedEvent], 'Test');
    expect(ics).toContain('URL:https://science.nasa.gov/eclipses/');
  });

  it('escapes commas and semicolons in SUMMARY', () => {
    const ics = buildICS([specialCharsEvent], 'Test');
    expect(ics).toContain('Event with\\, commas\\; and \\\\backslashes');
  });

  it('escapes newlines in DESCRIPTION as \\n', () => {
    const ics = buildICS([specialCharsEvent], 'Test');
    expect(ics).toContain('Line one\\nLine two');
  });

  it('folds lines longer than 75 octets with a space continuation', () => {
    const longEvent: CalendarEvent = {
      ...timedEvent,
      title: 'A'.repeat(100),
    };
    const ics = buildICS([longEvent], 'Test');
    const lines = ics.split('\r\n');
    const summaryLine = lines.find((l) => l.startsWith('SUMMARY:'));
    expect(summaryLine!.length).toBeLessThanOrEqual(75);
    const continuationLine = lines[lines.indexOf(summaryLine!) + 1];
    expect(continuationLine).toMatch(/^ /);
  });

  it('produces an empty calendar with no events', () => {
    const ics = buildICS([], 'Empty');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('includes X-WR-CALNAME with the calendar name', () => {
    const ics = buildICS([], 'My Space Calendar');
    expect(ics).toContain('X-WR-CALNAME:My Space Calendar');
  });

  it('handles multiple events', () => {
    const ics = buildICS([timedEvent, allDayEvent], 'Test');
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(count).toBe(2);
  });
});
