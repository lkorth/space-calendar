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
 *   [4] time of greatest eclipse (HH:MM:SS Terrestrial Time)
 *   [5] ΔT (s): Terrestrial Time minus UT
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
  /** Date as the catalog lists it, in Terrestrial Time. Event UIDs are made from it. */
  year: number;
  month: number;
  day: number;
  /** ISO 8601 UTC — greatest eclipse */
  greatest: string;
  type: 'Total' | 'Partial' | 'Penumbral';
  /** Penumbral duration in minutes — used to compute P1/P4 */
  penumbralDuration: number;
  /** ISO 8601 UTC — start of penumbral phase (P1, approximated) */
  p1: string;
  /** ISO 8601 UTC — start of umbral/partial phase (U1, approximated; undefined for penumbral) */
  u1?: string;
  /** ISO 8601 UTC — start of totality (U2, approximated; Total only) */
  u2?: string;
  /** ISO 8601 UTC — end of totality (U3, approximated; Total only) */
  u3?: string;
  /** ISO 8601 UTC — end of umbral/partial phase (U4, approximated; undefined for penumbral) */
  u4?: string;
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

/** ISO 8601 UTC to the nearest minute, e.g. "2026-03-03T11:34:00Z" */
function isoMinute(ms: number): string {
  return new Date(Math.round(ms / 60_000) * 60_000).toISOString().replace('.000Z', 'Z');
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
    const time = /^(\d{2}):(\d{2}):(\d{2})$/.exec(parts[4] ?? '');
    const deltaT = Number(parts[5]);
    const type = eclipseType(parts[8] ?? 'N');
    const penDur = parseDuration(parts[13] ?? '-');
    const parDur = parseDuration(parts[14] ?? '-');
    const totDur = parseDuration(parts[15] ?? '-');
    const geoLng = parseLng(parts[17] ?? '0E');

    if (!month || isNaN(day) || !time || isNaN(deltaT)) continue;

    const middle = Date.UTC(year, month - 1, day, Number(time[1]), Number(time[2]), Number(time[3]) - deltaT);
    const greatest = isoMinute(middle);
    const contact = (durationMin: number, side: 1 | -1) => isoMinute(middle + (side * durationMin * 60_000) / 2);
    const p1 = contact(penDur, -1);
    const p4 = contact(penDur, 1);
    const u1 = parDur > 0 ? contact(parDur, -1) : undefined;
    const u4 = parDur > 0 ? contact(parDur, 1) : undefined;
    const u2 = totDur > 0 ? contact(totDur, -1) : undefined;
    const u3 = totDur > 0 ? contact(totDur, 1) : undefined;

    results.push({ year, month, day, greatest, type, penumbralDuration: penDur, p1, u1, u2, u3, u4, p4, geoLng });
  }

  return results;
}

const SOLAR_CATALOG_URL = 'https://eclipse.gsfc.nasa.gov/5MCSE/5MKSEcatalog.txt';

export interface SolarEclipse {
  year: number;
  month: number;
  day: number;
  type: 'Total' | 'Annular' | 'Hybrid' | 'Partial';
}

const SOLAR_TYPES: Record<string, SolarEclipse['type']> = { T: 'Total', A: 'Annular', H: 'Hybrid', P: 'Partial' };

/** Solar eclipses from NASA's Five Millennium Catalog (Espenak and Meeus). Columns: catalog
 *  number, plate, year, month, day, time of greatest eclipse, ΔT in seconds, lunation, saros,
 *  type, … The time is Terrestrial Time, which runs ΔT ahead of UT. */
export async function fetchSolarEclipses(year: number): Promise<SolarEclipse[]> {
  const res = await fetch(SOLAR_CATALOG_URL);
  if (!res.ok) throw new Error(`NASA solar eclipse catalog error ${res.status}`);
  const results: SolarEclipse[] = [];
  for (const line of (await res.text()).split('\n')) {
    const m = /^\s*\d+\s+\d+\s+(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(-?\d+)\s+-?\d+\s+\d+\s+([A-Z])/.exec(line);
    if (!m) continue;
    const month = MONTH_MAP[m[2]!];
    const type = SOLAR_TYPES[m[8]!];
    if (!month || !type) continue;
    const ut = new Date(
      Date.UTC(Number(m[1]), month - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]) - Number(m[7])),
    );
    if (ut.getUTCFullYear() !== year) continue;
    results.push({ year, month: ut.getUTCMonth() + 1, day: ut.getUTCDate(), type });
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
