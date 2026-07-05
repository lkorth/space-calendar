import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from '../types.ts';

// Galactic center (Sagittarius A*): RA 17h 45m 40s, Dec -29° 00' 28"
const GC_RA_H = 17 + 45 / 60 + 40 / 3600;
const GC_DEC_DEG = -(29 + 0 / 60 + 28 / 3600);

const MIN_DARK_HOURS = 1.0;  // minimum moonless+dark+core overlap to count a night as good
const KV_TTL = 60 * 60 * 24; // 24h — refreshes naturally when pipeline regenerates

const toRad = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Pure astronomy helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/** Minimum useful core altitude in degrees for a given latitude.
 *  At high latitudes the core never rises far, so a lower floor is used. */
export function minCoreAltDeg(lat: number): number {
  return Math.abs(lat) >= 43 ? 14 : 18;
}

/** Maximum transit altitude of the galactic core for an observer at `lat` degrees */
export function coreMaxAlt(lat: number): number {
  return 90 - Math.abs(lat - GC_DEC_DEG);
}

/** Hours per day that the galactic core is above `alt` degrees at `lat` degrees.
 *  Returns 0 if it never rises that high, 24 if circumpolar above that altitude. */
export function coreHoursAboveAlt(alt: number, lat: number): number {
  const cosHA =
    (Math.sin(toRad(alt)) - Math.sin(toRad(lat)) * Math.sin(toRad(GC_DEC_DEG))) /
    (Math.cos(toRad(lat)) * Math.cos(toRad(GC_DEC_DEG)));
  if (cosHA > 1) return 0;
  if (cosHA < -1) return 24;
  return (Math.acos(cosHA) * 2 * 180) / Math.PI / 15;
}

/** Hours of overlap between two windows on a 24h clock. Either window may wrap midnight. */
export function overlapHours(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const step = 0.25;
  let overlap = 0;
  for (let h = 0; h < 24; h += step) {
    if (inWindow(h, aStart, aEnd) && inWindow(h, bStart, bEnd)) overlap += step;
  }
  return overlap;
}

export interface NightWindow {
  /** Total qualifying hours */
  hours: number;
  /** UTC hours from midnight of dateUTC when the window starts (may be > 24 if past midnight) */
  startHour: number;
  /** UTC hours from midnight of dateUTC when the window ends (may be > 24 if past midnight) */
  endHour: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function inWindow(h: number, s: number, e: number): boolean {
  return s < e ? h >= s && h < e : h >= s || h < e;
}

function julianDate(year: number, month: number, day: number): number {
  if (month <= 2) { year--; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function gmst0h(jd: number): number {
  const T = (Math.floor(jd + 0.5) - 0.5 - 2451545.0) / 36525;
  const gmst = 100.4606184 + 36000.77004 * T + 0.000387933 * T * T;
  return (((gmst / 15) % 24) + 24) % 24;
}

function sunPosition(jd: number): { ra: number; dec: number } {
  const n = jd - 2451545.0;
  const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
  const g = toRad(((357.528 + 0.9856003 * n) % 360 + 360) % 360);
  const lambda = toRad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const epsilon = toRad(23.439);
  return {
    ra: (((Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * 12) / Math.PI) + 24) % 24,
    dec: (Math.asin(Math.sin(epsilon) * Math.sin(lambda)) * 180) / Math.PI,
  };
}

// Low-precision moon position (~1° accuracy), sufficient for rise/set timing
function moonPosition(jd: number): { ra: number; dec: number } {
  const d = jd - 2451545.0;
  const Ldeg = ((218.316 + 13.176396 * d) % 360 + 360) % 360;
  const M = toRad(((134.963 + 13.064993 * d) % 360 + 360) % 360);
  const F = toRad(((93.272 + 13.229350 * d) % 360 + 360) % 360);
  const lon = toRad((Ldeg + 6.289 * Math.sin(M) + 360) % 360);
  const latMoon = toRad(5.128 * Math.sin(F));
  const epsilon = toRad(23.439);
  return {
    ra: (((Math.atan2(Math.cos(epsilon) * Math.sin(lon) - Math.tan(latMoon) * Math.sin(epsilon), Math.cos(lon)) * 12) / Math.PI) + 24) % 24,
    dec: (Math.asin(Math.sin(latMoon) * Math.cos(epsilon) + Math.cos(latMoon) * Math.sin(epsilon) * Math.sin(lon)) * 180) / Math.PI,
  };
}

function transitUT(raHours: number, jd: number, lon: number): number {
  return (((raHours - gmst0h(jd) - lon / 15) % 24) + 24) % 24;
}

// Returns the half-window in hours (0..12) for an object at `dec` to be above `alt` at `lat`.
// Returns null if the object never reaches `alt`, or 12 if always above it.
function hourAngleAtAlt(alt: number, lat: number, dec: number): number | null {
  const cosHA =
    (Math.sin(toRad(alt)) - Math.sin(toRad(lat)) * Math.sin(toRad(dec))) /
    (Math.cos(toRad(lat)) * Math.cos(toRad(dec)));
  if (cosHA > 1) return null;
  if (cosHA < -1) return 12;
  return (Math.acos(cosHA) * 180) / Math.PI / 15;
}

function offsetHoursAt(tz: string, ref: Date): number {
  const local = new Date(ref.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(ref.toLocaleString('en-US', { timeZone: 'UTC' }));
  return (local.getTime() - utc.getTime()) / 3600000;
}

/** Estimate an observer's *standard* (non-DST) UTC offset from an IANA timezone name.
 *  Used to approximate longitude (lon = offset * 15), which is a property of geography,
 *  not of the clock — so the DST-shifted offset must not be used here, or every
 *  DST-observing zone would compute a longitude ~15° too far east while DST is active.
 *  DST always adds to the standard offset (never subtracts), so the standard offset is
 *  the smaller of a January and a July reading, for either hemisphere. */
export function tzOffsetHours(tz: string | undefined): number {
  if (!tz) return 0;
  try {
    const jan = offsetHoursAt(tz, new Date(Date.UTC(2026, 0, 15, 0, 0, 0)));
    const jul = offsetHoursAt(tz, new Date(Date.UTC(2026, 6, 15, 0, 0, 0)));
    return Math.min(jan, jul);
  } catch {
    return 0;
  }
}

/** Compute the viewing window for a single night: the contiguous span where the galactic
 *  core is above the minimum altitude, it is astronomically dark, and the moon is below
 *  the horizon. dateUTC should be midnight UTC of the night in question.
 *
 *  The scan is centered on core transit so a window that spans midnight is found as a
 *  single block. startHour/endHour are UTC hours from midnight of dateUTC and may exceed
 *  24 if the window extends into the following day.
 *
 *  Returns null if there is no qualifying overlap. */
export function milkyWayWindowForNight(dateUTC: Date, lat: number, lon: number): NightWindow | null {
  const jd = julianDate(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth() + 1, dateUTC.getUTCDate()) + 0.5;

  const coreHW = hourAngleAtAlt(minCoreAltDeg(lat), lat, GC_DEC_DEG);
  if (coreHW === null || coreHW <= 0) return null;

  const sun = sunPosition(jd);
  const sunHW = hourAngleAtAlt(-18, lat, sun.dec);
  if (sunHW === null) {
    const cosHA = (Math.sin(toRad(-18)) - Math.sin(toRad(lat)) * Math.sin(toRad(sun.dec))) /
                  (Math.cos(toRad(lat)) * Math.cos(toRad(sun.dec)));
    if (cosHA > 1) return null; // midnight sun
  }

  const moon = moonPosition(jd);
  const moonHW = hourAngleAtAlt(0, lat, moon.dec);
  const moonAlwaysUp = moonHW !== null && moonHW >= 12;
  if (moonAlwaysUp) return null;

  const moonNeverRises = moonHW === null;
  const moonTransit = transitUT(moon.ra, jd, lon);
  const moonRise = moonNeverRises ? -1 : ((moonTransit - moonHW!) % 24 + 24) % 24;
  const moonSet = moonNeverRises ? -1 : ((moonTransit + moonHW!) % 24 + 24) % 24;

  const sunTransit = transitUT(sun.ra, jd, lon);
  const darkStart = sunHW !== null ? ((sunTransit + sunHW) % 24 + 24) % 24 : 0;
  const darkEnd = sunHW !== null ? ((sunTransit - sunHW) % 24 + 24) % 24 : 24;

  const coreTransit = transitUT(GC_RA_H, jd, lon);
  const coreRise = ((coreTransit - coreHW) % 24 + 24) % 24;
  const coreSet = ((coreTransit + coreHW) % 24 + 24) % 24;

  // Scan the 24h period centered on core transit so any midnight-spanning window is
  // encountered as a single contiguous stretch rather than split at h=0.
  const scanStart = ((coreTransit - 12) % 24 + 24) % 24;
  const step = 0.25;
  let overlap = 0;
  let windowStart = -1;
  let windowEnd = -1;

  for (let i = 0; i < 24 / step; i++) {
    const h = (scanStart + i * step) % 24;
    const absoluteH = scanStart + i * step;

    const isDark = sunHW === null ? true : inWindow(h, darkStart, darkEnd);
    const coreUp = inWindow(h, coreRise, coreSet);
    const moonDown = moonNeverRises ? true : !inWindow(h, moonRise, moonSet);

    if (isDark && coreUp && moonDown) {
      overlap += step;
      if (windowStart < 0) windowStart = absoluteH;
      windowEnd = absoluteH + step;
    }
  }

  if (overlap === 0) return null;
  return { hours: overlap, startHour: windowStart, endHour: windowEnd };
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export const milkyWayCategory: Category = {
  slug: 'milky-way',

  async fetch(env: Env, params: RequestParams): Promise<CategoryResult> {
    const { lat, tz } = params;
    if (lat === undefined) return { events: [], cache: true };
    if (coreMaxAlt(lat) < minCoreAltDeg(lat)) return { events: [], cache: true };

    const kvKey = `milky-way:${lat}`;
    const cached = await env.CALENDAR_KV.get(kvKey);
    if (cached) return { events: JSON.parse(cached) as CalendarEvent[], cache: true };

    const lon = tzOffsetHours(tz) * 15;
    const year = new Date().getUTCFullYear();
    const dayMs = 24 * 60 * 60 * 1000;

    const events: CalendarEvent[] = [];
    for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + dayMs)) {
      const window = milkyWayWindowForNight(d, lat, lon);
      if (!window || window.hours < MIN_DARK_HOURS) continue;

      const eventStart = new Date(d.getTime() + window.startHour * 3600000);
      const eventEnd = new Date(d.getTime() + window.endHour * 3600000);

      events.push({
        uid: `milky-way-${d.toISOString().slice(0, 10)}@space-calendar`,
        title: `🌌 Milky Way Viewing`,
        start: eventStart.toISOString(),
        end: eventEnd.toISOString(),
        allDay: false,
        description: buildDescription(lat, coreMaxAlt(lat), window.hours),
        url: 'https://www.lightpollutionmap.info/',
        category: 'milky-way',
      });
    }

    await env.CALENDAR_KV.put(kvKey, JSON.stringify(events), { expirationTtl: KV_TTL });
    return { events, cache: true };
  },
};

function buildDescription(lat: number, maxAlt: number, hours: number): string {
  const hemi = lat >= 0 ? 'south' : 'north';
  const latStr = `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`;
  return [
    `Tonight the galactic core reaches up to ${Math.round(maxAlt)}° above the horizon from your latitude (${latStr}), with approximately ${Math.round(hours * 10) / 10} hours where it is visible during astronomical darkness with the moon below the horizon.`,
    `Look ${hemi} after astronomical twilight ends and allow 20–30 minutes for your eyes to dark-adapt.`,
    `A dark site well away from city lights is essential. Check light pollution levels at lightpollutionmap.info before heading out.`,
  ].join('\n\n');
}
