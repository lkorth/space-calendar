/** A 12 × 31 grid with the Moon drawn for every day of the year. */
import { LocalClock, formatDay, monthName } from '../clock.ts';
import { readYearEvents } from '../events.ts';
import type { Eclipse } from '../events.ts';
import { annulus, circle, dashedRing, moonLit, rect } from '../geometry.ts';
import { PAGE_WIDTH } from '../svg.ts';
import type { Shape } from '../svg.ts';
import { fitStyle, hasGlyphs, textPath, textWidth } from '../text.ts';
import type { TextStyle, Weight } from '../text.ts';
import { daysOfYear, moonsAtNine } from '../year-sky.ts';
import type { LayoutInput } from './types.ts';

const PAD = 56;
const TEXT_LEFT = PAD + 4;
const TEXT_WIDTH = PAGE_WIDTH - 2 * TEXT_LEFT;
const LABEL_WIDTH = 64;
const COLUMN = (PAGE_WIDTH - 2 * PAD - LABEL_WIDTH) / 31;
const ROW_TOP = 188;
const ROW_HEIGHT = 67;
const MOON_R = 12.8;
const RING_R = 15.2;
/** Sunday first, to match getUTCDay() */
const WEEKDAYS = 'SMTWTFS';

const style = (size: number, weight: Weight, em: number): TextStyle => ({ size, weight, spacing: size * em });
const FOOTER = style(11, 400, 0.08);

export function moonCalendar(input: LayoutInput): Shape[] {
  const { year, lat, lon, tz, place, events } = input;
  const clock = new LocalClock(tz);
  const days = daysOfYear(year);
  const moons = moonsAtNine(days, clock);
  const { fullMoons, newMoons, eclipses } = readYearEvents(events, year, clock, { lat, lon });
  const ringed = new Set([...fullMoons.map((m) => m.day), ...newMoons]);
  const eclipsed = new Set(eclipses.filter((e) => e.visible).map((e) => e.day));

  const shapes: Shape[] = [];
  const add = (layer: string, d: string) => shapes.push({ layer, d });

  // Header
  const yearStyle = style(64, 300, 0.12);
  add('header', textPath(String(year), [TEXT_LEFT, 128], yearStyle));
  const afterYear = TEXT_LEFT + textWidth(String(year), yearStyle) + yearStyle.spacing!;
  add('header', textPath('LUNAR CALENDAR', [afterYear + 28, 128], style(18, 500, 0.42)));
  const right: [string, number][] = [
    [`PHASES AT 9 PM ${zoneLabel(tz, days[0]!)}`, 109],
    [`AS SEEN FROM ${place}`, 129],
  ];
  for (const [text, y] of right) {
    add('header', textPath(text, [PAGE_WIDTH - TEXT_LEFT, y], style(13, 400, 0.16), { anchor: 'end' }));
  }
  add('header', rect(PAD, 143, PAGE_WIDTH - 2 * PAD, 1));

  // Grid
  const columnX = (i: number) => PAD + LABEL_WIDTH + COLUMN * (i + 0.5);
  for (let i = 0; i < 31; i++) {
    add('day-numbers', textPath(String(i + 1), [columnX(i), 172], style(12, 500, 0.04), { anchor: 'middle' }));
  }
  for (let m = 0; m < 12; m++) {
    add('month-labels', textPath(monthName(m), [PAD, ROW_TOP + ROW_HEIGHT * m + 33], style(14, 600, 0.24)));
  }
  days.forEach((day, i) => {
    const date = new Date(day);
    const row = ROW_TOP + ROW_HEIGHT * date.getUTCMonth();
    const cx = columnX(date.getUTCDate() - 1);
    const cy = row + 27.5;
    const { fraction, waxing } = moons[i]!;
    add('moon-outline', annulus(cx, cy, MOON_R, 0.8));
    // South of the equator the Moon is seen the other way up, so the lit side swaps.
    add('moon-lit', moonLit(cx, cy, MOON_R, fraction, lat < 0 ? !waxing : waxing));
    if (eclipsed.has(day)) add('eclipse-ring', dashedRing(cx, cy, RING_R, 1.12, 28, 0.52));
    else if (ringed.has(day)) add('double-ring', annulus(cx, cy, RING_R, 0.96));

    const weekday = date.getUTCDay();
    const letter = style(10, weekday === 0 ? 600 : 400, 0.08);
    add('weekday', textPath(WEEKDAYS[weekday]!, [cx, row + 53.5], letter, { anchor: 'middle' }));
    if (weekday === 0) {
      const w = textWidth(WEEKDAYS[weekday]!, letter);
      add('sunday', rect(cx - w / 2, row + 55, w, 1));
    }
  });

  // Footer
  add('footer', rect(PAD, 1018, PAGE_WIDTH - 2 * PAD, 1));
  const moonLine = `FULL MOONS — ${fullMoons.map((m) => `${m.name} ${formatDay(m.day)}`).join(' · ')}`;
  const footerLine = (text: string, y: number) =>
    add('footer', textPath(text, [TEXT_LEFT, y], fitStyle(text, FOOTER, TEXT_WIDTH)));
  footerLine(moonLine, 1040);
  footerLine(eclipseLine(eclipses, place), 1060);
  for (const d of key(1080)) add('key', d);

  return shapes;
}

function eclipseLine(eclipses: readonly Eclipse[], place: string): string {
  const list = (wanted: boolean) =>
    eclipses
      .filter((e) => e.visible === wanted)
      .map((e) => `${e.type} ${e.kind} ${formatDay(e.day)}`.toUpperCase())
      .join(' · ');
  const hidden = list(false);
  const shown = `ECLIPSES VISIBLE FROM ${place} — ${list(true) || 'NONE'}`;
  return hidden ? `${shown}   ·   NOT VISIBLE — ${hidden}` : shown;
}

/** Each mark beside its name, with nothing else to read. */
function key(y: number): string[] {
  const out: string[] = [];
  const r = 6.4;
  const ring = 7.6;
  const items: [string, (cx: number, cy: number) => string[]][] = [
    ['FULL MOON', (cx, cy) => [circle(cx, cy, r), annulus(cx, cy, ring, 0.8)]],
    ['NEW MOON', (cx, cy) => [annulus(cx, cy, r, 0.8), annulus(cx, cy, ring, 0.8)]],
    ['ECLIPSE', (cx, cy) => [annulus(cx, cy, r, 0.8), dashedRing(cx, cy, ring, 0.96, 14, 0.52)]],
    ['SUNDAY', (cx) => {
      const letter = style(11, 600, 0);
      const w = textWidth('S', letter);
      return [textPath('S', [cx, y], letter, { anchor: 'middle' }), rect(cx - w / 2, y + 1.5, w, 1)];
    }],
  ];
  let x = TEXT_LEFT;
  for (const [label, icon] of items) {
    out.push(...icon(x + 8, y - 4.5), textPath(label, [x + 24, y], FOOTER));
    x += 24 + textWidth(label, FOOTER) + 28;
  }
  return out;
}

/** "EASTERN" for America/New_York. Zones without such a name get "LOCAL TIME". */
export function zoneLabel(tz: string, at: number): string {
  if (tz === 'UTC') return 'UTC';
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const label = /^(.+) Time$/.exec(name ?? '')?.[1]?.toUpperCase();
  return label && label.length <= 24 && hasGlyphs(label, 400) ? label : 'LOCAL TIME';
}
