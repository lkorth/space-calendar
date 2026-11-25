/** A circular year: January 1 at the top, running clockwise. */
import { DAY_MS, LocalClock, formatDay } from '../clock.ts';
import { readYearEvents } from '../events.ts';
import type { YearEvents } from '../events.ts';
import {
  annulus, capsule, circle, dashedRing, dotsAlong, polar, polygon, radialBar, strokePolyline, thinQuad,
} from '../geometry.ts';
import type { Point } from '../geometry.ts';
import { qrMatrix, qrPath, qrSize } from '../qr.ts';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../svg.ts';
import type { Shape } from '../svg.ts';
import { fitStyle, spokePlacement, tangentRotation, textPath, textWidth, wrapText } from '../text.ts';
import type { TextStyle, Weight } from '../text.ts';
import { daysOfYear, milkyWay, moonsAtNine, nights, sunDays } from '../year-sky.ts';
import type { MilkyWay, SunDay } from '../year-sky.ts';
import type { WheelInput } from './types.ts';

const CX = PAGE_WIDTH / 2;
const CY = PAGE_HEIGHT / 2;
/** Radii and sizes below are in the mockup's units, which this enlarges. */
const SCALE = 1.04;
const OUTER_R = 500;
/** Labels must be at least this far apart, in days */
export const LABEL_GAP = 14.5;
const LABEL_OUTER_R = 207;
const LABEL_INNER_R = 78;

const LONG_MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER',
  'DECEMBER',
];
const SEASONS: Record<number, { name: string; short: string }> = {
  3: { name: 'MARCH EQUINOX', short: 'EQUINOX' },
  6: { name: 'JUNE SOLSTICE', short: 'SOLSTICE' },
  9: { name: 'SEPT. EQUINOX', short: 'EQUINOX' },
  12: { name: 'DEC. SOLSTICE', short: 'SOLSTICE' },
};

const s = (v: number) => v * SCALE;
const at = (r: number, a: number): Point => polar(CX, CY, s(r), a);
const ringAt = (r: number, width: number) => annulus(CX, CY, s(r), s(width));
const text = (size: number, weight: Weight, spacing: number): TextStyle => ({
  size: s(size), weight, spacing: s(spacing),
});

/** Text running along the circle of radius `r`, centered on angle `a`. */
function tangent(label: string, r: number, a: number, style: TextStyle): string {
  return textPath(label, at(r, a), style, { anchor: 'middle', align: 'middle', rotate: tangentRotation(a) });
}

export function yearWheel(input: WheelInput): Shape[] {
  const { year, lat, lon, tz, events } = input;
  const clock = new LocalClock(tz);
  const days = daysOfYear(year);
  const n = days.length;
  const dayIndex = (day: number) => (day - days[0]!) / DAY_MS;
  const theta = (i: number) => -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / n;
  const boundary = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const barHalf = (0.32 * 2 * Math.PI) / n;
  const found = readYearEvents(events, year, clock, { lat, lon });
  const suns = sunDays(days, clock, { lat, lon });
  const galaxy = milkyWay(days, clock, { lat, lon });

  const shapes: Shape[] = [];
  const add = (layer: string, d: string, evenOdd = false) => shapes.push({ layer, d, ...(evenOdd && { evenOdd }) });

  // Months
  add('borders', ringAt(OUTER_R, 1.2));
  add('borders', ringAt(440, 1));
  for (let m = 0; m < 12; m++) {
    const first = dayIndex(Date.UTC(year, m, 1));
    const last = dayIndex(Date.UTC(year, m + 1, 1));
    add('months', thinQuad(at(440, boundary(first)), at(OUTER_R, boundary(first)), s(1.2)));
    const middle = theta((first + last - 1) / 2);
    const bottom = Math.sin(middle) > 0;
    add('months', tangent(LONG_MONTHS[m]!, bottom ? 462 : 481, middle, text(14, 600, 4)));
    add('months', tangent(sunLine(suns[first + 14]!, clock), bottom ? 483 : 460, middle, text(8.5, 400, 1)));
  }

  // Days
  for (let i = 0; i < n; i++) {
    const date = new Date(days[i]!).getUTCDate();
    const length = date === 10 || date === 20 ? 12 : date % 5 === 0 ? 7 : 4;
    add('ticks', thinQuad(at(440 - length, theta(i)), at(440, theta(i)), s(length > 4 ? 1.1 : 0.7)));
  }

  // Moon
  const wave = moonsAtNine(days, clock).map(({ fraction }, i) =>
    radialBar(CX, CY, s(376), s(380 + 40 * fraction), theta(i), barHalf),
  );
  add('moon-wave', wave.join(''));
  add('moon-wave', ringAt(372, 0.8));
  for (const day of found.newMoons) {
    add('new-moons', annulus(...at(358, theta(dayIndex(day))), s(5.2), s(1.3)));
  }
  found.fullMoons.forEach(({ day, name }) => {
    const i = dayIndex(day);
    add('full-moons', circle(...at(358, theta(i)), s(6)));
    const next = [...found.newMoons, days.at(-1)! + 15 * DAY_MS].map(dayIndex).find((j) => j > i)!;
    const room = (358 * 2 * Math.PI * (next - i)) / n - 13 - 9;
    const nameStyle = fitStyle(name, text(8.5, 600, 0.6), s(room));
    const nameWidth = textWidth(name, nameStyle) / SCALE;
    add('full-moons', tangent(name, 358, theta(i) + (nameWidth / 2 + 13) / 358, nameStyle));
    const number = String(new Date(day).getUTCDate());
    const numberStyle = text(8.5, 400, 0.4);
    const numberWidth = textWidth(number, numberStyle) / SCALE;
    add('full-moons', tangent(number, 358, theta(i) - (numberWidth / 2 + 12) / 358, numberStyle));
  });

  // Day or night
  if (input.ring === 'day') shapes.push(...dayRing(days, suns, found, theta, dayIndex, lat));
  else shapes.push(...nightRing(days, suns, clock, { lat, lon }, theta));

  // Milky Way, hanging from the inner circle
  add('milky-way', ringAt(250, 0.8));
  // Nights of ten hours or more, common in the south, must still end short of the labels.
  const perHour = Math.min(4, 28 / Math.max(...galaxy.hours));
  const bars = galaxy.hours.map((h, i) =>
    h > 0 ? radialBar(CX, CY, s(250 - 4 - perHour * h), s(250), theta(i), barHalf) : '',
  );
  add('milky-way', bars.join(''));

  // Events
  const labels = eventLabels(found, galaxy, days);
  const spots = spreadLabels(labels.map((l) => dayIndex(l.day)), n);
  labels.forEach((label, k) => {
    const trueAngle = theta(dayIndex(label.day));
    const labelAngle = theta(spots[k]!);
    add('leaders', strokePolyline([at(250, trueAngle), at(218, trueAngle), at(212, labelAngle)], s(1.4)));
    const { rotate, anchor } = spokePlacement(labelAngle);
    const room = s(LABEL_OUTER_R - LABEL_INNER_R);
    const lines: [string, TextStyle, number][] = [
      [label.title, text(10.5, 600, 1.2), -5.5],
      [label.detail, text(8.5, 400, 1), 6.5],
    ];
    for (const [line, style, dy] of lines) {
      const placement = { anchor, rotate, align: 'middle', dy: s(dy) } as const;
      add('labels', textPath(line, at(LABEL_OUTER_R, labelAngle), fitStyle(line, style, room), placement));
    }
  });

  // Sun
  add('sun', ringAt(72, 0.8));
  add('sun', circle(CX, CY, s(17)));
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    add('sun', capsule(at(23, a), at(k % 2 === 0 ? 33 : 29, a), s(1.6)));
  }

  shapes.push(...corners(input));
  return shapes;
}

function sunLine({ sun }: SunDay, clock: LocalClock): string {
  if (sun === 'above') return '15TH · SUN UP ALL DAY';
  if (sun === 'below') return '15TH · SUN DOWN ALL DAY';
  return `15TH · RISE ${clock.time(sun.rise)} · SET ${clock.time(sun.set)}`;
}

type Theta = (i: number) => number;

function dayRing(
  days: readonly number[],
  suns: readonly SunDay[],
  found: YearEvents,
  theta: Theta,
  dayIndex: (day: number) => number,
  lat: number,
): Shape[] {
  const lengths = days.map((_, i) => suns[i]!.length);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  // Near the equator the days barely differ, and the crescent must not exaggerate that.
  const span = Math.max(max - min, 1);
  const outer = lengths.map((length) => 262 + ((length - min) / span) * 78);

  const crescent =
    polygon(outer.map((r, i) => at(r, theta(i)))) + circle(CX, CY, s(256), true);
  const solstice = (month: number) => found.seasons.find((x) => x.month === month)?.day;
  const longestDay = solstice(lat < 0 ? 12 : 6);
  const shortestDay = solstice(lat < 0 ? 6 : 12);
  const shapes: Shape[] = [];
  let cutout = '';

  const place = (title: string, day: number | undefined, hours: number, style: TextStyle) => {
    if (day === undefined) return;
    const i = dayIndex(day);
    const label = `${title} · ${formatLength(hours)}`;
    // On the band only if it is thick enough there to hold the text; otherwise above it.
    if (title === 'LONGEST DAY' && outer[i]! >= 335) cutout = tangent(label, 318, theta(i), style);
    else shapes.push({ layer: 'day-labels', d: tangent(label, outer[i]! + 14, theta(i), style) });
  };
  place('LONGEST DAY', longestDay, max, text(11, 600, 1.6));
  place('SHORTEST DAY', shortestDay, min, text(10, 500, 1.6));

  shapes.unshift({ layer: 'daylight', d: crescent + cutout, evenOdd: true });
  return shapes;
}

export function formatLength(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, '0')}M`;
}

function nightRing(
  days: readonly number[],
  suns: readonly SunDay[],
  clock: LocalClock,
  place: { lat: number; lon: number },
  theta: Theta,
): Shape[] {
  const all = nights(days, suns, clock, place);
  const { from, to } = nightSpan(all);
  const inner = 258;
  const outer = 344;
  const radius = (t: number) => inner + ((Math.min(Math.max(t, from), to) - from) / (to - from)) * (outer - inner);

  const band = (rIn: (i: number) => number, rOut: (i: number) => number) =>
    polygon(days.map((_, i) => at(rOut(i), theta(i)))) +
    polygon(days.map((_, i) => at(rIn(i), theta(i))).reverse());

  const shapes: Shape[] = [];
  const add = (layer: string, d: string) => shapes.push({ layer, d });
  add('daylight', band(() => inner, (i) => radius(all[i]!.sunset)));
  add('daylight', band((i) => radius(all[i]!.sunrise), () => outer));
  for (const edge of ['dusk', 'dawn'] as const) add('darkness', darknessDots(all.map((x) => x[edge]), radius, theta));
  add('moon-up', all.flatMap((night, i) =>
    night.moonUp
      .filter(([a, b]) => radius(b) - radius(a) > 0.3)
      .map(([a, b]) => thinQuad(at(radius(a), theta(i)), at(radius(b), theta(i)), s(1.3))),
  ).join(''));
  const midnight = radius(24);
  const dashes = Math.round((2 * Math.PI * midnight) / 15);
  add('midnight', dashedRing(CX, CY, s(midnight), s(1.2), dashes, 2 / 3));
  add('night-border', ringAt(inner, 0.8));
  add('night-border', ringAt(outer, 0.8));
  return shapes;
}

/** The clock hours the night ring spans: from the hour before the earliest sunset of the year
 *  to the quarter hour after the latest sunrise, so every place fills the ring. Always holds
 *  midnight, and at most noon to noon. */
export function nightSpan(all: readonly { sunset: number; sunrise: number }[]): { from: number; to: number } {
  const earliest = Math.min(...all.map((x) => x.sunset));
  const latest = Math.max(...all.map((x) => x.sunrise));
  return {
    from: Math.min(Math.max(Math.floor(earliest), 12), 23),
    to: Math.max(Math.min(Math.ceil(latest * 4) / 4, 36), 25),
  };
}

/** Dots along one edge of full darkness, broken where a night never gets that dark. */
function darknessDots(hours: readonly (number | null)[], radius: (t: number) => number, theta: Theta): string {
  const n = hours.length;
  const point = (i: number) => at(radius(hours[i % n]!), theta(i % n));
  const gap = hours.findIndex((h) => h === null);
  if (gap === -1) return dotsAlong(hours.map((_, i) => point(i)), s(1.5), s(3.4), true);
  let d = '';
  let run: Point[] = [];
  // Start at a gap so that no run crosses the end of the list.
  for (let k = 1; k <= n; k++) {
    const i = (gap + k) % n;
    if (hours[i] !== null) run.push(point(i));
    if (hours[i] === null || k === n) {
      if (run.length > 1) d += dotsAlong(run, s(1.5), s(3.4), false);
      run = [];
    }
  }
  return d;
}

export interface Label { day: number; title: string; detail: string }

interface Item { day: number; title: string; short: string; detail: string; rank: number }

/** Labels for the year's events. Events within a day of each other share one. */
export function eventLabels(found: YearEvents, galaxy: MilkyWay, days: readonly number[]): Label[] {
  const items: Item[] = [
    ...found.eclipses.filter((e) => e.visible).map((e): Item => {
      const kind = e.type === 'Penumbral' ? 'PENUMBRAL' : `${e.type} ${e.kind}`.toUpperCase();
      return { day: e.day, title: `${kind} ECLIPSE`, short: `${kind} ECLIPSE`, detail: e.when ?? '', rank: 0 };
    }),
    ...found.seasons.map((x): Item => ({ day: x.day, title: SEASONS[x.month]!.name, short: SEASONS[x.month]!.short, detail: '', rank: 1 })),
    ...found.oppositions.map((x): Item => ({ day: x.day, title: `${x.name} OPPOSITION`, short: `${x.name} OPPOSITION`, detail: '', rank: 2 })),
    ...found.showers.map((x): Item => ({ day: x.day, title: x.name, short: x.name, detail: `MOON ${x.moonPercent}%`, rank: 3 })),
  ].sort((a, b) => a.day - b.day);

  const groups: Item[][] = [];
  for (const item of items) {
    const group = groups.at(-1);
    if (group && item.day - group[0]!.day <= DAY_MS) group.push(item);
    else groups.push([item]);
  }

  const labels = groups.map((group): Label => {
    const byRank = [...group].sort((a, b) => a.rank - b.rank || a.day - b.day);
    const main = byRank[0]!;
    if (group.length === 1) return { day: main.day, title: main.title, detail: join(formatDay(main.day), main.detail) };
    const combined = byRank.map((x) => x.short).join(' · ');
    if (combined.length <= 18) {
      const dates = [...new Set(byRank.map((x) => formatDay(x.day)))];
      return { day: main.day, title: combined, detail: dates.join(' · ') };
    }
    const others = byRank.slice(1).map((x) => (x.day === main.day ? x.short : `${x.short} ${formatDay(x.day)}`));
    return { day: main.day, title: main.title, detail: join(formatDay(main.day), ...others) };
  });

  if (galaxy.best) {
    const [first, last] = galaxy.best;
    const middle = days[Math.floor((first + last) / 2)]!;
    labels.push({
      day: middle,
      title: 'MILKY WAY PEAK',
      detail: `${formatDay(days[first]!)} – ${formatDay(days[last]!)}`,
    });
  }
  return labels.sort((a, b) => a.day - b.day);
}

const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');

/** Push label positions apart until none are closer than LABEL_GAP days, across the new year
 *  too. Positions may run outside 0…n. */
export function spreadLabels(positions: readonly number[], n: number): number[] {
  const out = [...positions];
  const count = out.length;
  if (count < 2) return out;
  for (let pass = 0; pass < 500; pass++) {
    let moved = false;
    for (let k = 0; k < count; k++) {
      const wraps = k === count - 1;
      const next = wraps ? 0 : k + 1;
      const gap = out[next]! + (wraps ? n : 0) - out[k]!;
      if (gap >= LABEL_GAP - 1e-6) continue;
      const push = (LABEL_GAP - gap) / 2;
      out[k]! -= push;
      out[next]! += push;
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

const PAGE_LEFT = 64;
const PAGE_RIGHT = 1472;
const PAGE_BOTTOM = 1080;
const COLUMN = 200;

const plain = (size: number, weight: Weight, em: number): TextStyle => ({ size, weight, spacing: size * em });

function corners(input: WheelInput): Shape[] {
  const shapes: Shape[] = [];
  const add = (layer: string, d: string, evenOdd = false) => shapes.push({ layer, d, ...(evenOdd && { evenOdd }) });

  add('title', textPath(String(input.year), [PAGE_LEFT, 117], plain(64, 300, 0.1)));
  add('title', textPath('A YEAR OF SKY', [PAGE_LEFT, 151], plain(16, 500, 0.32)));
  const from = `AS SEEN FROM ${input.place}`;
  add('title', textPath(from, [PAGE_LEFT, 175], fitStyle(from, plain(12, 400, 0.16), 300)));

  for (const d of legend(input.ring)) add('legend', d);

  const matrix = input.qrUrl ? qrMatrix(input.qrUrl) : null;
  if (matrix) {
    const size = qrSize(matrix);
    const body = plain(11, 400, 0.1);
    const lines = wrapText('SCAN TO BROWSE THE EVENTS', body, () => Math.max(size, COLUMN));
    const top = PAGE_BOTTOM - 24 - lines.length * 16 - size;
    add('qr', qrPath(matrix, PAGE_LEFT, top), true);
    lines.forEach((line, i) => add('qr', textPath(line, [PAGE_LEFT, top + size + 24 + i * 16], body)));
  }
  return shapes;
}

/** What each mark means: the mark, then a few words. Right-aligned at the bottom right. */
function legend(ring: 'day' | 'night'): string[] {
  const heading = plain(11, 600, 0.24);
  const body = plain(11, 400, 0.1);
  const icon = 26;
  const lineHeight = 21;
  type Draw = (x: number, y: number) => string;
  const bars = (heights: number[], down: boolean): Draw => (x, y) =>
    heights.map((h, i) => polygon(
      ([[0, 0], [2, 0], [2, 1], [0, 1]] as const).map(([dx, dy]): Point => [
        x + 2 + i * 4 + dx, down ? y - 5 + dy * h : y + 5 - h + dy * h,
      ]),
    )).join('');
  const rows: [string, Draw][] = [
    ['MOON BRIGHTNESS', bars([3, 5, 8, 10, 8, 5], false)],
    ['FULL MOON', (x, y) => circle(x + 13, y, 5)],
    ['NEW MOON', (x, y) => annulus(x + 13, y, 4.5, 1.2)],
    ...(ring === 'day'
      ? ([['HOURS OF DAYLIGHT', (x, y) => polygon([[x + 2, y + 2], [x + 24, y - 5], [x + 24, y + 5], [x + 2, y + 5]])]] as [string, Draw][])
      : ([
          ['DAYLIGHT', (x, y) => polygon([[x + 2, y - 4], [x + 24, y - 4], [x + 24, y + 4], [x + 2, y + 4]])],
          ['FULLY DARK BETWEEN', (x, y) => dotsAlong([[x + 2, y - 4], [x + 24, y - 4]], 1.5, 3.4, false) + dotsAlong([[x + 2, y + 4], [x + 24, y + 4]], 1.5, 3.4, false)],
          ['MIDNIGHT', (x, y) => thinQuad([x + 2, y], [x + 12, y], 1.2) + thinQuad([x + 15, y], [x + 25, y], 1.2)],
          ['MOON IS UP', (x, y) => [5, 10, 15, 20].map((dx) => thinQuad([x + dx, y - 5], [x + dx, y + 5], 1.3)).join('')],
        ] as [string, Draw][])),
    ['MILKY WAY NIGHTS', bars([5, 7, 9, 9, 7, 5], true)],
  ];
  const widest = Math.max(...rows.map(([label]) => textWidth(label, body)));
  const left = PAGE_RIGHT - widest - icon - 8;
  const notes = ['JAN 1 AT TOP, CLOCKWISE', ...(ring === 'night' ? ['DUSK INSIDE, DAWN OUTSIDE'] : [])];
  const top = PAGE_BOTTOM - (rows.length + notes.length) * lineHeight;
  const out = [textPath('HOW TO READ IT', [left, top], heading)];
  notes.forEach((note, i) => {
    out.push(textPath(note, [left, top + lineHeight * (i + 1) - 2], fitStyle(note, body, PAGE_RIGHT - left)));
  });
  rows.forEach(([label, draw], i) => {
    const y = top + lineHeight * (i + 1 + notes.length) - 6;
    out.push(draw(left, y), textPath(label, [left + icon + 8, y], body, { align: 'middle' }));
  });
  return out;
}

/** Used by tests: how far the wheel reaches, in px from the center. */
export const WHEEL_RADIUS = s(OUTER_R) + s(0.6);
export const WHEEL_CENTER: Point = [CX, CY];
