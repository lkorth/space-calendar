import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '../../models.ts';
import { LocalClock } from '../clock.ts';
import { readYearEvents } from '../events.ts';
import { bounds, contours } from '../path-testing.ts';
import { ARTWORK_BOTTOM, ARTWORK_TOP, PAGE_WIDTH, renderSvg } from '../svg.ts';
import type { Shape } from '../svg.ts';
import { daysOfYear, milkyWay } from '../year-sky.ts';
import { moonCalendar, zoneLabel } from './moon-calendar.ts';
import { LABEL_GAP, WHEEL_CENTER, WHEEL_RADIUS, eventLabels, formatLength, nightSpan, spreadLabels, yearWheel } from './year-wheel.ts';

const events = JSON.parse(
  readFileSync('src/shared/wall-calendar/fixtures/events-2027.json', 'utf-8'),
) as CalendarEvent[];
const ohio = { year: 2027, lat: 40, lon: -83, tz: 'America/New_York', place: 'OHIO', events };
const qrUrl = 'https://space-calendar.lukekorth.com/sky?lat=40&lon=-83';

const layouts: Record<string, () => Shape[]> = {
  'moon calendar': () => moonCalendar(ohio),
  'day wheel': () => yearWheel({ ...ohio, ring: 'day', qrUrl }),
  'night wheel': () => yearWheel({ ...ohio, ring: 'night', qrUrl }),
};

for (const [name, build] of Object.entries(layouts)) {
  describe(`${name}, laser mode`, () => {
    const shapes = build();
    const svg = renderSvg(name, shapes, 'laser');
    const [artwork, outline] = svg.split('<g id="page-outline-reference-only">');

    it('is 16 × 12 in', () => {
      expect(svg).toContain('width="16in" height="12in" viewBox="0 0 1536 1152"');
    });

    it('draws filled paths in one black group and nothing else', () => {
      expect(artwork).toContain('<g id="artwork" fill="#000000"');
      expect(artwork!.match(/<g /g)).toHaveLength(1);
      expect(artwork).not.toMatch(/stroke|transform|<(text|pattern|clipPath|mask|use|rect|circle|line)\b/);
    });

    it('marks the page edge in red, apart from the artwork', () => {
      expect(outline).toContain('stroke="#ff0000"');
    });

    it('keeps artwork inside the artwork band', () => {
      for (const { layer, d } of shapes) {
        if (!d) continue;
        const b = bounds(d);
        expect(b.y0, layer).toBeGreaterThanOrEqual(ARTWORK_TOP);
        expect(b.y1, layer).toBeLessThanOrEqual(ARTWORK_BOTTOM);
        expect(b.x0, layer).toBeGreaterThanOrEqual(0);
        expect(b.x1, layer).toBeLessThanOrEqual(PAGE_WIDTH);
      }
    });

    it('has no NaN or scientific notation in its coordinates', () => {
      expect(svg).not.toMatch(/NaN|Infinity|\de-?\d/);
    });
  });

  it(`${name}: print mode draws the same paths on a dark page`, () => {
    const paths = (svg: string) => svg.match(/<path[^>]+>/g);
    const preview = renderSvg(name, build(), 'print');
    expect(preview).toContain('fill="#111214"');
    expect(preview).toContain('fill="#dcdee1"');
    expect(preview).not.toContain('stroke');
    expect(paths(preview)).toEqual(paths(renderSvg(name, build(), 'laser')));
  });

  it(`${name}: layers match their snapshot`, () => {
    // A digest for each layer: a change names the layer that moved, without megabytes of SVG.
    const layers = new Map<string, string[]>();
    for (const { layer, d } of build()) layers.set(layer, [...(layers.get(layer) ?? []), d]);
    const summary = [...layers].map(([layer, ds]) => {
      const digest = createHash('sha256').update(ds.join('\n')).digest('hex').slice(0, 12);
      return `${layer}: ${ds.length} shapes, ${digest}`;
    });
    expect(summary).toMatchSnapshot();
  });
}

describe('moon calendar', () => {
  it('rings full and new moons, and only the eclipses seen from the place', () => {
    const count = (layer: string) => moonCalendar(ohio).filter((s) => s.layer === layer).length;
    expect(count('eclipse-ring')).toBe(2);
    expect(count('double-ring')).toBe(25 - 2);
    expect(count('moon-outline')).toBe(365);
  });

  it('mirrors the Moon south of the equator', () => {
    const lit = (lat: number) => moonCalendar({ ...ohio, lat }).filter((s) => s.layer === 'moon-lit').map((s) => s.d);
    expect(lit(-40)[10]).not.toBe(lit(40)[10]);
  });

  it('names the zone where it has a plain name', () => {
    const at = Date.UTC(2027, 0, 1);
    expect(zoneLabel('America/New_York', at)).toBe('EASTERN');
    expect(zoneLabel('UTC', at)).toBe('UTC');
    expect(zoneLabel('Etc/GMT+5', at)).toBe('LOCAL TIME');
  });
});

describe('event labels', () => {
  const clock = new LocalClock(ohio.tz);
  const days = daysOfYear(2027);
  const found = readYearEvents(events, 2027, clock, ohio);
  const labels = eventLabels(found, milkyWay(days, clock, ohio), days);
  const texts = labels.map((l) => `${l.title} / ${l.detail}`);

  it('merges events on neighboring days', () => {
    expect(texts).toContain('PENUMBRAL ECLIPSE / FEB 20 · MARS OPPOSITION');
    expect(texts).toContain('SOLSTICE · URSIDS / DEC 21 · DEC 22');
  });

  it('gives everything else its own label', () => {
    expect(texts).toContain('QUADRANTIDS / JAN 4 · MOON 6%');
    expect(texts).toContain('JUPITER OPPOSITION / FEB 11');
    expect(texts).toContain('PENUMBRAL ECLIPSE / AUG 17 · AROUND 3 AM');
    expect(labels).toHaveLength(17);
  });

  it('are spread at least the minimum gap apart, across the new year too', () => {
    const at = spreadLabels(labels.map((l) => (l.day - days[0]!) / 86_400_000), 365);
    at.forEach((p, i) => {
      const next = i === at.length - 1 ? at[0]! + 365 : at[i + 1]!;
      expect(next - p).toBeGreaterThanOrEqual(LABEL_GAP - 0.01);
    });
  });

  it('stay between the center circle and the leaders', () => {
    for (const { d } of yearWheel({ ...ohio, ring: 'night' }).filter((s) => s.layer === 'labels')) {
      for (const [x, y] of contours(d).flat()) {
        const r = Math.hypot(x - WHEEL_CENTER[0], y - WHEEL_CENTER[1]) / 1.04;
        expect(r).toBeGreaterThan(72);
        expect(r).toBeLessThan(212);
      }
    }
  });
});

describe('year wheel', () => {
  it('keeps the legend, title and QR code clear of the wheel', () => {
    for (const ring of ['day', 'night'] as const) {
      for (const { layer, d } of yearWheel({ ...ohio, ring, qrUrl })) {
        if (!['legend', 'title', 'qr'].includes(layer) || !d) continue;
        for (const [x, y] of contours(d).flat()) {
          const r = Math.hypot(x - WHEEL_CENTER[0], y - WHEEL_CENTER[1]);
          expect(r, `${ring} ${layer}`).toBeGreaterThan(WHEEL_RADIUS + 8);
        }
      }
    }
  });

  it('draws a QR code only when asked', () => {
    const hasQr = (input: object) => yearWheel({ ...ohio, ring: 'day', ...input }).some((s) => s.layer === 'qr');
    expect(hasQr({})).toBe(false);
    expect(hasQr({ qrUrl })).toBe(true);
  });

  it('keeps full moon names clear of the new moon circles', () => {
    const shapes = yearWheel({ ...ohio, ring: 'day' });
    const points = (layer: string) => shapes.filter((x) => x.layer === layer).map((x) => contours(x.d).flat());
    const centers = points('new-moons').map((ps) => {
      const xs = ps.map(([x]) => x);
      const ys = ps.map(([, y]) => y);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const;
    });
    for (const [x, y] of points('full-moons').flat()) {
      for (const [cx, cy] of centers) expect(Math.hypot(x - cx, y - cy)).toBeGreaterThan(5.85 * 1.04);
    }
  });

  it('widens the night ring only where nights run longer than Ohio’s', () => {
    expect(nightSpan([{ sunset: 17.1, sunrise: 31.9 }])).toEqual({ from: 17, to: 32.25 });
    expect(nightSpan([{ sunset: 15.5, sunrise: 33.1 }])).toEqual({ from: 15, to: 33.5 });
  });

  it('formats day lengths', () => {
    expect(formatLength(15.017)).toBe('15H 01M');
    expect(formatLength(24)).toBe('24H 00M');
  });
});

describe('other places', () => {
  const places = [
    { lat: -34, lon: 151, tz: 'Australia/Sydney', place: 'SYDNEY' },
    { lat: 70, lon: 25, tz: 'Europe/Oslo', place: 'NORDKAPP' },
    { lat: 0, lon: -78, tz: 'America/Guayaquil', place: 'QUITO' },
    { lat: 51.5, lon: 0, tz: 'Europe/London', place: 'LONDON' },
    { lat: -90, lon: 0, tz: 'Antarctica/McMurdo', place: 'SOUTH POLE' },
    { lat: 2, lon: -157, tz: 'Pacific/Kiritimati', place: 'KIRITIMATI' },
  ];
  for (const where of places) {
    it(`${where.place} draws sane calendars`, () => {
      const all = [
        moonCalendar({ ...ohio, ...where }),
        yearWheel({ ...ohio, ...where, ring: 'day' }),
        yearWheel({ ...ohio, ...where, ring: 'night' }),
      ];
      for (const shapes of all) {
        for (const { layer, d } of shapes) {
          expect(d, layer).not.toMatch(/NaN|Infinity/);
          if (!d) continue;
          const b = bounds(d);
          expect(b.y0, layer).toBeGreaterThanOrEqual(ARTWORK_TOP);
          expect(b.y1, layer).toBeLessThanOrEqual(ARTWORK_BOTTOM);
        }
      }
    });
  }
});
