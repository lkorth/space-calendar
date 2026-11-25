import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '../models.ts';
import { TYPES, completeYears, drawWallCalendar, fileName, parseOptions, readLink, writeLink } from './options.ts';
import type { Options } from './options.ts';
import { MAX_QR_MODULES, qrMatrix } from './qr.ts';

const events = JSON.parse(
  readFileSync('src/shared/wall-calendar/fixtures/events-2027.json', 'utf-8'),
) as CalendarEvent[];
const OHIO = 'lat=40&lon=-83&tz=America/New_York&place=Ohio&year=2027';
const NOW = new Date('2026-11-25T00:00:00Z');
const parse = (query: string) => parseOptions(new URLSearchParams(query), NOW);

describe('parseOptions', () => {
  it('reads every option', () => {
    expect(parse(`type=year-wheel-night&${OHIO}&mode=laser&qr=true`)).toEqual({
      type: 'year-wheel-night', year: 2027, lat: 40, lon: -83, tz: 'America/New_York', place: 'OHIO', mode: 'laser',
      qr: true,
    });
  });

  it('has sensible defaults', () => {
    const p = parse('type=moon-calendar&lat=-33.87&lon=151.21&tz=Australia/Sydney') as Options;
    expect(p).toMatchObject({ mode: 'print', qr: false, place: '33.9° S', lat: -33.9, lon: 151.2 });
    expect(p.year).toBe(2027); // from October, the next year
    const query = new URLSearchParams('type=moon-calendar&lat=1&lon=1&tz=UTC');
    expect((parseOptions(query, new Date('2027-03-01')) as Options).year).toBe(2027);
  });

  it('keeps accented place names and rejects what the font cannot draw', () => {
    expect(parse(`type=moon-calendar&${OHIO.replace('Ohio', 'S%C3%A3o Paulo')}`)).toMatchObject({ place: 'SÃO PAULO' });
    expect(parse(`type=moon-calendar&${OHIO.replace('Ohio', '東京')}`)).toHaveProperty('error');
    expect(parse(`type=moon-calendar&${OHIO.replace('Ohio', 'x'.repeat(25))}`)).toHaveProperty('error');
  });

  it('rejects bad input', () => {
    const bad = [
      'lon=-83&tz=UTC', 'lat=40&tz=UTC', 'lat=40&lon=-83', 'lat=abc&lon=-83&tz=UTC', 'lat=91&lon=0&tz=UTC',
      'lat=40&lon=181&tz=UTC', 'lat=&lon=0&tz=UTC', 'lat=40&lon=-83&tz=Mars/Olympus', `${OHIO}&mode=cut`,
      `${OHIO}&qr=1`, `${OHIO}&qr=https://example.com`, 'lat=40&lon=-83&tz=UTC&year=27',
    ];
    for (const query of bad) expect(parse(`type=year-wheel-day&${query}`), query).toHaveProperty('error');
  });

  it('names the types when one is missing or unknown', () => {
    const error = { error: 'type must be one of moon-calendar, year-wheel-day, year-wheel-night' };
    expect(parse(`type=poster&${OHIO}`)).toEqual(error);
    expect(parse(OHIO)).toEqual(error);
  });

  it('refuses a QR code on the moon calendar, which has no room for one', () => {
    expect(parse(`type=moon-calendar&${OHIO}&qr=true`)).toHaveProperty('error');
    expect(parse(`type=moon-calendar&${OHIO}&qr=false`)).toMatchObject({ qr: false });
  });
});

describe('links', () => {
  const options = { type: 'year-wheel-day', year: '2027', lat: '-33.9', lon: '151.2', tz: 'Australia/Sydney', place: 'São & Co #1', qr: 'true' };

  it('carry every option there and back', () => {
    expect(readLink(writeLink(options))).toEqual(options);
    expect(parseOptions(new URLSearchParams(writeLink({ ...options, place: 'Sydney' }).slice(1)), NOW)).not.toHaveProperty('error');
  });

  it('leave out what is empty or unknown', () => {
    expect(writeLink({ type: 'moon-calendar', place: '  ' })).toBe('#type=moon-calendar');
    expect(readLink('#type=moon-calendar&mode=laser&utm_source=x&lat=')).toEqual({ type: 'moon-calendar' });
    expect(readLink('')).toEqual({});
  });
});

describe('completeYears', () => {
  it('leaves out a year with only part of its moons', () => {
    expect(completeYears(events)).toEqual([2027]);
    expect(completeYears(events.filter((e) => e.start < '2027-09'))).toEqual([]);
  });
});

describe('drawWallCalendar', () => {
  for (const type of TYPES) {
    it(`draws ${type}`, () => {
      const options = parse(`type=${type}&${OHIO}&mode=laser`) as Options;
      expect(drawWallCalendar(options, events)).toContain('fill="#000000"');
      expect(fileName(options)).toBe(`${type}-2027-laser.svg`);
    });
  }

  it('has room for the QR link of any place', () => {
    const matrix = qrMatrix('https://space-calendar.lukekorth.com/sky?lat=-90&lon=-180');
    expect(matrix!.length).toBeLessThanOrEqual(MAX_QR_MODULES);
  });
});
