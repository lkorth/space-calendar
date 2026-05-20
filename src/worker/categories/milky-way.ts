import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from '../types.ts';

// Galactic center (Sagittarius A*): RA 17h 45m 40s, Dec -29° 00' 28"
const GC_RA_H = 17 + 45 / 60 + 40 / 3600;
const GC_DEC_DEG = -(29 + 0 / 60 + 28 / 3600);

const MIN_DARK_HOURS = 1.0;  // minimum moonless+dark+core overlap to count a night as good
const KV_TTL = 60 * 60 * 24; // 24h — refreshes naturally when pipeline regenerates
const MAX_GAP_DAYS = 2;      // group windows separated by ≤1 borderline night

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

/** Estimate UTC offset in hours from an IANA timezone name (summer date to capture DST) */
export function tzOffsetHours(tz: string | undefined): number {
  if (!tz) return 0;
  try {
    const ref = new Date(Date.UTC(2026, 5, 15, 0, 0, 0));
    const local = new Date(ref.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(ref.toLocaleString('en-US', { timeZone: 'UTC' }));
    return (local.getTime() - utc.getTime()) / 3600000;
  } catch {
    return 0;
  }
}

/** Hours where the galactic core is above MIN_CORE_ALT_DEG, it is astronomically dark
 *  (sun below -18°), AND the moon is below the horizon — all on the same night.
 *  dateUTC should be midnight UTC of the night in question. */
export function milkyWayHoursForNight(dateUTC: Date, lat: number, lon: number): number {
  const jd = julianDate(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth() + 1, dateUTC.getUTCDate()) + 0.5;

  // Galactic core: check if it ever rises above the minimum useful altitude
  const coreHW = hourAngleAtAlt(minCoreAltDeg(lat), lat, GC_DEC_DEG);
  if (coreHW === null || coreHW <= 0) return 0;

  // Sun: check for astronomical darkness
  const sun = sunPosition(jd);
  const sunHW = hourAngleAtAlt(-18, lat, sun.dec);
  if (sunHW === null) {
    // Determine if midnight sun (no darkness) or polar night (all dark)
    const cosHA = (Math.sin(toRad(-18)) - Math.sin(toRad(lat)) * Math.sin(toRad(sun.dec))) /
                  (Math.cos(toRad(lat)) * Math.cos(toRad(sun.dec)));
    if (cosHA > 1) return 0; // midnight sun
    // Polar night — skip the darkness check below
  }

  // Moon: compute rise/set. moonHW === null means never rises; 12 means circumpolar above horizon.
  const moon = moonPosition(jd);
  const moonHW = hourAngleAtAlt(0, lat, moon.dec);
  const moonAlwaysUp = moonHW !== null && moonHW >= 12;
  if (moonAlwaysUp) return 0; // moonlit all night, never useful

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

  // Three-way overlap: dark ∩ core above threshold ∩ moon below horizon
  const step = 0.25;
  let overlap = 0;
  for (let h = 0; h < 24; h += step) {
    const isDark = sunHW === null ? true : inWindow(h, darkStart, darkEnd);
    const coreUp = inWindow(h, coreRise, coreSet);
    const moonDown = moonNeverRises ? true : !inWindow(h, moonRise, moonSet);
    if (isDark && coreUp && moonDown) overlap += step;
  }
  return overlap;
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

    // Scan every night of the year
    type GoodNight = { date: Date; hours: number };
    const goodNights: GoodNight[] = [];
    for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + dayMs)) {
      const hours = milkyWayHoursForNight(d, lat, lon);
      if (hours >= MIN_DARK_HOURS) goodNights.push({ date: new Date(d), hours });
    }

    // Group consecutive good nights (tolerate up to 1-night gap for borderline transitions)
    const events: CalendarEvent[] = [];
    let i = 0;
    while (i < goodNights.length) {
      let j = i;
      let bestHours = goodNights[i]!.hours;
      let bestDate = goodNights[i]!.date;

      while (j + 1 < goodNights.length) {
        const gapDays = (goodNights[j + 1]!.date.getTime() - goodNights[j]!.date.getTime()) / dayMs;
        if (gapDays > MAX_GAP_DAYS) break;
        j++;
        if (goodNights[j]!.hours > bestHours) {
          bestHours = goodNights[j]!.hours;
          bestDate = goodNights[j]!.date;
        }
      }

      const windowStart = goodNights[i]!.date;
      const windowEnd = new Date(goodNights[j]!.date.getTime() + dayMs); // DTEND is exclusive
      const monthName = windowStart.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const peakDate = bestDate.toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
      const nights = j - i + 1;

      events.push({
        uid: `milky-way-${windowStart.toISOString().slice(0, 10)}@space-calendar`,
        title: `🌌 Milky Way Window — ${monthName}`,
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        allDay: true,
        description: buildDescription(lat, coreMaxAlt(lat), Math.round(bestHours * 10) / 10, peakDate, nights),
        url: 'https://www.lightpollutionmap.info/',
        category: 'milky-way',
      });

      i = j + 1;
    }

    await env.CALENDAR_KV.put(kvKey, JSON.stringify(events), { expirationTtl: KV_TTL });
    return { events, cache: true };
  },
};

function buildDescription(lat: number, maxAlt: number, peakHours: number, peakDate: string, nights: number): string {
  const hemi = lat >= 0 ? 'south' : 'north';
  const latStr = `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`;
  const lines = [
    `The galactic core reaches up to ${Math.round(maxAlt)}° above the horizon from your latitude (${latStr}). During this window you can expect up to ${peakHours} hours per night where the core is visible during astronomical darkness with the moon below the horizon.`,
    nights > 1
      ? `Best night: ${peakDate}. Look ${hemi} after astronomical twilight ends and allow 20–30 minutes for your eyes to dark-adapt.`
      : `Look ${hemi} after astronomical twilight ends and allow 20–30 minutes for your eyes to dark-adapt.`,
    `A dark site well away from city lights is essential. Check light pollution levels at lightpollutionmap.info before heading out.`,
  ];
  return lines.join('\n\n');
}
