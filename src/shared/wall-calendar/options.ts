/** The options of a wall calendar, shared by the page that draws one in the browser and the
 *  command line. Nothing here touches the network or the DOM. */
import type { CalendarEvent } from '../models.ts';
import { moonCalendar } from './layouts/moon-calendar.ts';
import { yearWheel } from './layouts/year-wheel.ts';
import { renderSvg } from './svg.ts';
import type { Mode, PageShape } from './svg.ts';
import { hasGlyphs } from './text.ts';
import type { TextTurn } from './text.ts';

export const TYPES = ['moon-calendar', 'year-wheel-day', 'year-wheel-night'] as const;
export type WallCalendarType = (typeof TYPES)[number];

export interface Options {
  type: WallCalendarType;
  year: number;
  lat: number;
  lon: number;
  tz: string;
  place: string;
  mode: Mode;
  /** Draw a QR code that opens the event browser for this place */
  qr: boolean;
  text: TextTurn;
  shape: PageShape;
}

export const MAX_PLACE_LENGTH = 24;

/** The page the QR code opens. Short, because every character adds modules. */
const BROWSE_URL = 'https://space-calendar.lukekorth.com/sky';

/** Options, or what is wrong with them. A feed URL must keep working for years, so its parser
 *  guesses around mistakes. A calendar is made once, in ink or metal, so this one does not. */
export function parseOptions(q: URLSearchParams, now: Date): Options | { error: string } {
  const type = TYPES.find((t) => t === q.get('type'));
  if (!type) return { error: `type must be one of ${TYPES.join(', ')}` };
  const lat = coordinate(q.get('lat'), 90);
  if (lat === undefined) return { error: 'lat must be in degrees, from -90 to 90' };
  const lon = coordinate(q.get('lon'), 180);
  if (lon === undefined) return { error: 'lon must be in degrees, from -180 to 180' };
  const tz = zone(q.get('tz'));
  if (!tz) return { error: 'tz must be an IANA time zone, such as Europe/London' };

  const mode = q.get('mode') ?? 'print';
  if (mode !== 'print' && mode !== 'laser') return { error: 'mode must be print or laser' };
  const rawQr = q.get('qr') ?? 'false';
  if (rawQr !== 'true' && rawQr !== 'false') return { error: 'qr must be true or false' };
  const qr = rawQr === 'true';
  const text = q.get('text') ?? 'upright';
  if (text !== 'upright' && text !== 'outward') return { error: 'text must be upright or outward' };
  const shape = q.get('shape') ?? 'rectangle';
  if (shape !== 'rectangle' && shape !== 'circle') return { error: 'shape must be rectangle or circle' };
  if (type === 'moon-calendar') {
    if (qr) return { error: 'qr is available on the year wheels only' };
    if (text === 'outward') return { error: 'text is available on the year wheels only' };
    if (shape === 'circle') return { error: 'shape is available on the year wheels only' };
  }
  if (qr && shape === 'circle') return { error: 'a circle has no room for a qr code' };

  const rawYear = q.get('year');
  const year = rawYear === null ? defaultYear(now) : Number(rawYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'year must be a four-digit year' };

  const place = cleanPlace(q.get('place')) ?? latitudeLabel(lat);
  if ([...place].length > MAX_PLACE_LENGTH) return { error: `place must be ${MAX_PLACE_LENGTH} characters or fewer` };
  if (!hasGlyphs(place, 400)) return { error: 'place has a character the font does not have' };

  return { type, year, lat, lon, tz, place, mode, qr, text, shape };
}

/** A tenth of a degree moves sunrise by under half a minute. */
function coordinate(raw: string | null, limit: number): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return undefined;
  return Math.round(value * 10) / 10 + 0;
}

function zone(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Next year from October on, when people make calendars for it. */
export function defaultYear(now: Date): number {
  return now.getUTCFullYear() + (now.getUTCMonth() >= 9 ? 1 : 0);
}

function cleanPlace(raw: string | null): string | undefined {
  const place = raw?.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/'/g, '’').toUpperCase();
  return place || undefined;
}

function latitudeLabel(lat: number): string {
  return `${Math.abs(lat)}° ${lat < 0 ? 'S' : 'N'}`;
}

/** The years whose events are complete. Every year has about 24 new and full moons; a year
 *  with only its first few is the tail of another year's data. */
export function completeYears(events: readonly CalendarEvent[]): number[] {
  const counts = new Map<number, number>();
  for (const event of events) {
    if (event.category !== 'moon-phases') continue;
    const year = new Date(event.start).getUTCFullYear();
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 24).map(([year]) => year).sort();
}

export function drawWallCalendar(options: Options, events: readonly CalendarEvent[]): string {
  const { type, year, lat, lon, tz, place, mode, qr, text, shape } = options;
  const input = { year, lat, lon, tz, place, events };
  if (type === 'moon-calendar') return renderSvg(`${year} Lunar Calendar — ${place}`, moonCalendar(input), mode);
  const ring = type === 'year-wheel-night' ? 'night' : 'day';
  // Whole degrees, so the link does not say exactly where the calendar hangs.
  const qrUrl = `${BROWSE_URL}?lat=${Math.round(lat)}&lon=${Math.round(lon)}`;
  const shapes = yearWheel({ ...input, ring, text, shape, ...(qr && { qrUrl }) });
  return renderSvg(`${year} Year Wheel — ${place}`, shapes, mode, shape);
}

/** Options a link carries, as typed. The mode is left out: it belongs to a download. */
const LINK_NAMES = ['type', 'year', 'lat', 'lon', 'tz', 'place', 'qr', 'text', 'shape'] as const;
export type LinkOptions = Partial<Record<(typeof LINK_NAMES)[number], string>>;

/** The part of a link after the #. Browsers do not send it, so the location stays private. */
export function writeLink(options: LinkOptions): string {
  const query = new URLSearchParams();
  for (const name of LINK_NAMES) {
    const value = options[name]?.trim();
    if (value) query.set(name, value);
  }
  return `#${query}`;
}

export function readLink(hash: string): LinkOptions {
  const query = new URLSearchParams(hash.replace(/^#/, ''));
  const out: LinkOptions = {};
  for (const name of LINK_NAMES) {
    const value = query.get(name)?.trim();
    if (value) out[name] = value;
  }
  return out;
}

export function fileName({ type, year, mode, shape }: Options): string {
  return `${type}${shape === 'circle' ? '-circle' : ''}-${year}-${mode}.svg`;
}
