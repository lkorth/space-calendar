/**
 * NASA Five Millennium Lunar Eclipse Catalog
 * Source: https://eclipse.gsfc.nasa.gov/5MCLE/5MKLEcatalog.txt
 * Authors: Fred Espenak and Jean Meeus (public domain)
 *
 * Catalog line format (whitespace-delimited):
 *   [0] catalog number
 *   [1] year
 *   [2] month abbreviation
 *   [3] day
 *   [4] time of greatest eclipse (HH:MM:SS UT)
 *   [5] ΔT (s)
 *   [6] lunation number
 *   [7] saros series
 *   [8] eclipse type (T/T+/T-/P/N/Nx/...)
 *   [9] QSE flags
 *   [10] gamma
 *   [11] penumbral magnitude
 *   [12] umbral magnitude
 *   [13] penumbral duration (min)
 *   [14] partial duration (min, or "-")
 *   [15] total duration (min, or "-")
 *   [16] geographic latitude at greatest
 *   [17] geographic longitude at greatest
 */

const CATALOG_URL = 'https://eclipse.gsfc.nasa.gov/5MCLE/5MKLEcatalog.txt';

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export interface LunarEclipse {
  year: number;
  month: number;
  day: number;
  /** UTC time of greatest eclipse HH:MM */
  greatest: string;
  type: 'Total' | 'Partial' | 'Penumbral';
  /** Penumbral duration in minutes — used to compute P1/P4 */
  penumbralDuration: number;
  /** ISO 8601 UTC — start of penumbral phase (P1, approximated) */
  p1: string;
  /** ISO 8601 UTC — end of penumbral phase (P4, approximated) */
  p4: string;
  /** Approximate geographic longitude of greatest eclipse (degrees east) */
  geoLng: number;
}

function eclipseType(code: string): LunarEclipse['type'] {
  if (code.startsWith('T')) return 'Total';
  if (code.startsWith('P')) return 'Partial';
  return 'Penumbral';
}

function parseDuration(s: string): number {
  return s === '-' ? 0 : parseFloat(s);
}

function parseLng(s: string): number {
  const match = s.match(/^(\d+(?:\.\d+)?)([EW])$/);
  if (!match) return 0;
  const deg = parseFloat(match[1] ?? '0');
  return match[2] === 'W' ? -deg : deg;
}

function addMinutes(isoDatetime: string, minutes: number): string {
  const d = new Date(isoDatetime);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

export async function fetchLunarEclipses(year: number): Promise<LunarEclipse[]> {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`NASA eclipse catalog error ${res.status}`);
  const text = await res.text();

  const results: LunarEclipse[] = [];

  for (const line of text.split('\n')) {
    // Data lines start with a 5-digit catalog number
    if (!/^\d{5}/.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 16) continue;

    const lineYear = parseInt(parts[1] ?? '', 10);
    if (lineYear !== year) continue;

    const month = MONTH_MAP[parts[2] ?? ''];
    const day = parseInt(parts[3] ?? '', 10);
    const timeStr = parts[4] ?? '00:00:00';
    const greatest = timeStr.slice(0, 5); // HH:MM
    const type = eclipseType(parts[8] ?? 'N');
    const penDur = parseDuration(parts[13] ?? '-');
    const geoLng = parseLng(parts[17] ?? '0E');

    if (!month || isNaN(day)) continue;

    const greatestISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${greatest}:00Z`;
    const halfPen = penDur / 2;
    const p1 = addMinutes(greatestISO, -halfPen);
    const p4 = addMinutes(greatestISO, halfPen);

    results.push({ year, month, day, greatest, type, penumbralDuration: penDur, p1, p4, geoLng });
  }

  return results;
}

/** Rough visibility description based on longitude of greatest eclipse */
export function eclipseVisibility(geoLng: number): string {
  // The eclipse is visible from roughly ±90° of the sub-lunar longitude
  // Map to broad regional descriptions
  const regions: string[] = [];
  const lo = ((geoLng - 90) % 360 + 360) % 360;
  const hi = ((geoLng + 90) % 360 + 360) % 360;

  const covers = (lng: number) => {
    const l = (lng + 360) % 360;
    return lo <= hi ? l >= lo && l <= hi : l >= lo || l <= hi;
  };

  if (covers(260) || covers(290) || covers(310)) regions.push('Americas');
  if (covers(10) || covers(20) || covers(30)) regions.push('Europe & Africa');
  if (covers(80) || covers(100) || covers(120)) regions.push('Asia');
  if (covers(140) || covers(150)) regions.push('Australia');
  if (covers(180) || covers(200) || covers(220)) regions.push('Pacific');

  return regions.length > 0 ? regions.join(', ') : 'parts of Earth';
}
