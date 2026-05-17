/**
 * NASA GSFC per-eclipse central path tables.
 * Source: https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE{date}{type}path.html
 *
 * Parses the fixed-width central-line table and matches a curated city list
 * against the path of totality/annularity.
 */

export interface PathPoint {
  /** HH:MM UTC */
  utcHHMM: string;
  /** decimal degrees, positive = N */
  lat: number;
  /** decimal degrees, positive = E */
  lon: number;
  widthKm: number;
  durationSec: number;
}

export interface PathLocation {
  city: string;
  country: string;
  /** ISO 8601 UTC — moment of central eclipse */
  centralUTC: string;
  /** ISO 8601 UTC — start of totality/annularity (central − duration/2) */
  c2UTC: string;
  /** ISO 8601 UTC — end of totality/annularity (central + duration/2) */
  c3UTC: string;
  durationSec: number;
}

/** Major cities with [lat, lon] for matching against eclipse paths */
const CITIES: Array<{ city: string; country: string; lat: number; lon: number }> = [
  { city: 'Reykjavik',      country: 'Iceland',        lat:  64.13, lon: -21.93 },
  { city: 'Tórshavn',       country: 'Faroe Islands',  lat:  62.01, lon:  -6.77 },
  { city: 'Bergen',         country: 'Norway',         lat:  60.39, lon:   5.32 },
  { city: 'Oslo',           country: 'Norway',         lat:  59.91, lon:  10.75 },
  { city: 'Stockholm',      country: 'Sweden',         lat:  59.33, lon:  18.07 },
  { city: 'Helsinki',       country: 'Finland',        lat:  60.17, lon:  24.94 },
  { city: 'London',         country: 'UK',             lat:  51.51, lon:  -0.13 },
  { city: 'Paris',          country: 'France',         lat:  48.86, lon:   2.35 },
  { city: 'Amsterdam',      country: 'Netherlands',    lat:  52.37, lon:   4.90 },
  { city: 'Berlin',         country: 'Germany',        lat:  52.52, lon:  13.40 },
  { city: 'Madrid',         country: 'Spain',          lat:  40.42, lon:  -3.70 },
  { city: 'Barcelona',      country: 'Spain',          lat:  41.39, lon:   2.15 },
  { city: 'Lisbon',         country: 'Portugal',       lat:  38.72, lon:  -9.14 },
  { city: 'Rome',           country: 'Italy',          lat:  41.90, lon:  12.50 },
  { city: 'Valencia',       country: 'Spain',          lat:  39.47, lon:  -0.38 },
  { city: 'Palma',          country: 'Spain',          lat:  39.57, lon:   2.65 },
  { city: 'Algiers',        country: 'Algeria',        lat:  36.74, lon:   3.06 },
  { city: 'Tunis',          country: 'Tunisia',        lat:  36.82, lon:  10.17 },
  { city: 'Casablanca',     country: 'Morocco',        lat:  33.59, lon:  -7.62 },
  { city: 'Fes',            country: 'Morocco',        lat:  34.03, lon:  -5.00 },
  { city: 'Tripoli',        country: 'Libya',          lat:  32.90, lon:  13.18 },
  { city: 'Cairo',          country: 'Egypt',          lat:  30.04, lon:  31.24 },
  { city: 'Istanbul',       country: 'Turkey',         lat:  41.01, lon:  28.95 },
  { city: 'Athens',         country: 'Greece',         lat:  37.98, lon:  23.73 },
  { city: 'Ankara',         country: 'Turkey',         lat:  39.93, lon:  32.86 },
  { city: 'New York',       country: 'USA',            lat:  40.71, lon: -74.01 },
  { city: 'Toronto',        country: 'Canada',         lat:  43.65, lon: -79.38 },
  { city: 'Mexico City',    country: 'Mexico',         lat:  19.43, lon: -99.13 },
  { city: 'São Paulo',      country: 'Brazil',         lat: -23.55, lon: -46.63 },
  { city: 'Buenos Aires',   country: 'Argentina',      lat: -34.60, lon: -58.38 },
  { city: 'Dubai',          country: 'UAE',            lat:  25.20, lon:  55.27 },
  { city: 'Mumbai',         country: 'India',          lat:  19.08, lon:  72.88 },
  { city: 'Tokyo',          country: 'Japan',          lat:  35.69, lon: 139.69 },
  { city: 'Sydney',         country: 'Australia',      lat: -33.87, lon: 151.21 },
  { city: 'Nuuk',           country: 'Greenland',      lat:  64.18, lon: -51.74 },
  { city: 'Longyearbyen',   country: 'Svalbard',       lat:  78.22, lon:  15.63 },
];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function typeCode(type: string): string {
  if (type === 'Total') return 'T';
  if (type === 'Annular') return 'A';
  if (type === 'Hybrid') return 'H';
  return 'P';
}

function parseDurationSec(s: string): number {
  const m = s.match(/(\d+)m([\d.]+)s/);
  if (!m) return 0;
  return Math.round(parseInt(m[1]!) * 60 + parseFloat(m[2]!));
}

function parseMinDir(minStr: string): { val: number; dir: string } {
  return { val: parseFloat(minStr.slice(0, -1)), dir: minStr.slice(-1) };
}

function toDecimal(deg: string, minDir: string): number {
  const d = parseInt(deg) + parseMinDir(minDir).val / 60;
  const dir = parseMinDir(minDir).dir;
  return dir === 'S' || dir === 'W' ? -d : d;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addSeconds(isoBase: string, sec: number): string {
  const d = new Date(isoBase);
  d.setSeconds(d.getSeconds() + sec);
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function hhmmToISO(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00Z`;
}

export async function fetchEclipsePath(
  year: number, month: number, day: number, type: string,
): Promise<PathPoint[]> {
  if (type === 'Partial') return [];
  const mon = MONTH_ABBR[month - 1]!;
  const dd = String(day).padStart(2, '0');
  const tc = typeCode(type);
  const url = `https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE${year}${mon}${dd}${tc}path.html`;

  let text: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const points: PathPoint[] = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length < 14) continue;
    if (!/^\d{2}:\d{2}$/.test(p[0]!)) continue;

    // Column layout depends on whether the northern limit is on Earth.
    // Normal:  time N_latDeg N_latMin N_lonDeg N_lonMin S_latDeg S_latMin S_lonDeg S_lonMin C_latDeg C_latMin C_lonDeg C_lonMin ratio alt az width dur
    // Off-Earth N: time - - S_latDeg S_latMin S_lonDeg S_lonMin C_latDeg C_latMin C_lonDeg C_lonMin ratio alt az width dur
    const off = (p[1] === '-' && p[2] === '-') ? 7 : 9;

    try {
      const lat = toDecimal(p[off]!, p[off + 1]!);
      const lon = toDecimal(p[off + 2]!, p[off + 3]!);
      // Layout after central lat/lon: ratio(+4) alt(+5) az(+6) width(+7) duration(+8)
      const widthKm = parseInt(p[off + 7]!);
      const durationSec = parseDurationSec(p[off + 8]!);
      if (isNaN(lat) || isNaN(lon) || isNaN(widthKm)) continue;
      points.push({ utcHHMM: p[0]!, lat, lon, widthKm, durationSec });
    } catch {
      continue;
    }
  }
  return points;
}

export function matchCitiesToPath(
  points: PathPoint[], eclipseDateStr: string,
): PathLocation[] {
  if (points.length === 0) return [];

  const results: PathLocation[] = [];
  for (const { city, country, lat, lon } of CITIES) {
    let minDist = Infinity;
    let nearest: PathPoint | null = null;

    for (const pt of points) {
      const d = haversineKm(lat, lon, pt.lat, pt.lon);
      if (d < minDist) { minDist = d; nearest = pt; }
    }

    if (!nearest || minDist > nearest.widthKm / 2) continue;

    const centralUTC = hhmmToISO(eclipseDateStr, nearest.utcHHMM);
    const halfSec = Math.round(nearest.durationSec / 2);
    results.push({
      city, country,
      centralUTC,
      c2UTC: addSeconds(centralUTC, -halfSec),
      c3UTC: addSeconds(centralUTC, halfSec),
      durationSec: nearest.durationSec,
    });
  }

  // Sort by c2 time (west-to-east path order)
  results.sort((a, b) => a.c2UTC.localeCompare(b.c2UTC));
  return results;
}
