import { describe, it, expect } from 'vitest';
import type { CalendarEvent, CategorySlug } from '../models.ts';
import { LocalClock, formatDay } from './clock.ts';
import { fullMoonName, readYearEvents } from './events.ts';

const OHIO = { lat: 40, lon: -83 };
const clock = new LocalClock('America/New_York');

function event(category: CategorySlug, uid: string, title: string, start: string, extra: Partial<CalendarEvent> = {}) {
  const allDay = !start.includes('T');
  return { uid, title, start, end: start, allDay, description: '', category, ...extra } satisfies CalendarEvent;
}

const read = (events: CalendarEvent[], place = OHIO, zone = clock, year = 2027) =>
  readYearEvents(events, year, zone, place);

describe('LocalClock', () => {
  it('converts across a daylight-saving change', () => {
    expect(clock.at(Date.UTC(2027, 0, 1), 21)).toBe(Date.UTC(2027, 0, 2, 2));
    expect(clock.at(Date.UTC(2027, 6, 1), 21)).toBe(Date.UTC(2027, 6, 2, 1));
    expect(clock.hoursAfter(Date.UTC(2027, 6, 1), Date.UTC(2027, 6, 2, 1))).toBe(21);
  });

  it('formats times and dates', () => {
    expect(clock.time(Date.UTC(2027, 0, 15, 12, 52))).toBe('7:52 AM');
    expect(clock.time(Date.UTC(2027, 0, 15, 5, 5))).toBe('12:05 AM');
    expect(clock.nearestHour(Date.UTC(2027, 7, 17, 7, 14))).toBe('3 AM');
    expect(formatDay(Date.UTC(2027, 11, 3))).toBe('DEC 3');
  });
});

describe('fullMoonName', () => {
  it('reads the name the calendar gives', () => {
    expect(fullMoonName('🌕 Full Moon — Wolf Moon (Supermoon)')).toBe('WOLF');
    expect(fullMoonName("🌕 Full Moon — Hunter's Moon")).toBe('HUNTER’S');
    expect(fullMoonName('🌕 Full Moon — Sturgeon Moon — Blue Moon')).toBe('BLUE');
    expect(fullMoonName('🌑 New Moon')).toBeNull();
  });
});

describe('readYearEvents', () => {
  it('puts timed events on their local date', () => {
    const { fullMoons, newMoons } = read([
      event('moon-phases', 'a', '🌕 Full Moon — Strawberry Moon', '2027-06-19T00:44:00.000Z'),
      event('moon-phases', 'b', '🌑 New Moon', '2027-07-04T03:02:00.000Z'),
      event('moon-phases', 'c', '🌑 New Moon', '2028-01-01T12:00:00.000Z'),
    ]);
    expect(fullMoons.map((m) => `${m.name} ${formatDay(m.day)}`)).toEqual(['STRAWBERRY JUN 18']);
    expect(newMoons.map(formatDay)).toEqual(['JUL 3']);
  });

  it('gives each shower the Moon of its peak night', () => {
    const shower = (slug: string, date: string) =>
      event('meteor-showers', `meteor-shower-${slug}-2027@space-calendar`, 'x', date);
    const { showers } = read([
      shower('quadrantids', '2027-01-04'), shower('delta-aquariids', '2027-07-30'), shower('geminids', '2027-12-14'),
    ]);
    expect(showers.map((s) => `${s.name} ${s.moonPercent}`)).toEqual([
      'QUADRANTIDS 6', 'DELTA AQUARIIDS 7', 'GEMINIDS 96',
    ]);
  });

  it('keeps the oppositions of naked-eye planets only', () => {
    const { oppositions } = read([
      event('oppositions', 'opposition-jupiter-2027-02-11@space-calendar', 'x', '2027-02-11'),
      event('oppositions', 'opposition-neptune-2027-09-29@space-calendar', 'x', '2027-09-29'),
    ]);
    expect(oppositions).toEqual([{ day: Date.UTC(2027, 1, 11), name: 'JUPITER' }]);
  });

  const lunar = (start: string, end: string, greatest: string) =>
    event('eclipses-lunar', 'e', '🌕 Penumbral Lunar Eclipse', start, {
      end, contactTimes: [{ label: 'Greatest eclipse', utc: greatest }],
    });

  it('decides which lunar eclipses can be seen from the place', () => {
    const { eclipses } = read([
      lunar('2027-02-20T21:14:00Z', '2027-02-21T01:14:00Z', '2027-02-20T23:14:00Z'),
      lunar('2027-07-18T15:59:00Z', '2027-07-18T16:09:00Z', '2027-07-18T16:04:00Z'),
      lunar('2027-08-17T05:25:00Z', '2027-08-17T09:03:00Z', '2027-08-17T07:14:00Z'),
    ]);
    // July's lasts ten minutes and cannot be seen from anywhere.
    expect(eclipses.map((e) => [formatDay(e.day), e.visible])).toEqual([['FEB 20', true], ['AUG 17', true]]);
    expect(eclipses[1]!.when).toBe('AROUND 3 AM');
  });

  it('marks a lunar eclipse below the horizon as not visible', () => {
    const { eclipses } = read(
      [lunar('2027-08-17T05:25:00Z', '2027-08-17T09:03:00Z', '2027-08-17T07:14:00Z')],
      { lat: 28, lon: 77 },
      new LocalClock('Asia/Kolkata'),
    );
    expect(eclipses[0]!.visible).toBe(false);
    expect(eclipses[0]!.when).toBeUndefined();
  });

  it('decides which solar eclipses can be seen from the place', () => {
    const solar = [
      event('eclipses-solar', 's1', '🌑 Annular Solar Eclipse', '2027-02-06'),
      event('eclipses-solar', 's2', '🌑 Total Solar Eclipse', '2027-08-02'),
    ];
    expect(read(solar).eclipses.map((e) => e.visible)).toEqual([false, false]);
    // Luxor is on the center line of the 2027 August total eclipse; Madrid is off it.
    const luxor = read(solar, { lat: 25.7, lon: 32.6 }, new LocalClock('Africa/Cairo')).eclipses[1]!;
    expect([luxor.visible, luxor.type]).toEqual([true, 'Total']);
    const madrid = read(solar, { lat: 40.4, lon: -3.7 }, new LocalClock('Europe/Madrid')).eclipses[1]!;
    expect([madrid.visible, madrid.type, formatDay(madrid.day)]).toEqual([true, 'Partial', 'AUG 2']);
  });
});
