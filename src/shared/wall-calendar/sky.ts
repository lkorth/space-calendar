/** Where the Sun and Moon are, for the curves an wall calendar draws for one place: the
 *  daily Moon, sunrise and sunset, twilight, and when the Moon is up. Events with a date
 *  come from the calendar data instead (see events.ts).
 *
 *  Truncated series from Meeus, "Astronomical Algorithms" (chapters 25 and 47): about 0.01°
 *  for the Sun and 0.02° for the Moon, which is a few seconds of rise and set time. */

const RAD = Math.PI / 180;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** TT − UT, near enough for the decades calendars are made for. */
const DELTA_T_MS = 70_000;
const EARTH_RADIUS_KM = 6371;
const AU_KM = 149_597_870.7;

/** Sun center altitude at sunrise and sunset, allowing for refraction and its radius. */
export const RISE_SET_ALT = -0.833;
export const ASTRONOMICAL_DARK_ALT = -18;

export interface Position {
  /** Ecliptic longitude and latitude, radians */
  lon: number;
  lat: number;
  /** Right ascension and declination, radians */
  ra: number;
  dec: number;
  distanceKm: number;
}

export interface Place {
  lat: number;
  lon: number;
}

const centuries = (ms: number) => (ms + DELTA_T_MS - J2000_MS) / DAY_MS / 36525;

function toEquatorial(lon: number, lat: number, distanceKm: number, t: number): Position {
  const eps = (23.43929 - 0.0130042 * t) * RAD;
  return {
    lon,
    lat,
    distanceKm,
    ra: Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)),
    dec: Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon)),
  };
}

export function sunPosition(ms: number): Position {
  const t = centuries(ms);
  const m = (357.52911 + 35999.05029 * t) * RAD;
  const center =
    (1.914602 - 0.004817 * t) * Math.sin(m) + 0.019993 * Math.sin(2 * m) + 0.000289 * Math.sin(3 * m);
  const aberration = 0.00569;
  const lon = (280.46646 + 36000.76983 * t + center - aberration) * RAD;
  const distance = 1.00014 - 0.01671 * Math.cos(m) - 0.00014 * Math.cos(2 * m);
  return toEquatorial(lon, 0, distance * AU_KM, t);
}

/** Largest periodic terms: multiples of D, M, M′ and F, then the amplitude of the sine in
 *  longitude (millionths of a degree) and of the cosine in distance (metres). */
const LON_DIST: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
];

const LAT: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359],
];

export function moonPosition(ms: number): Position {
  const t = centuries(ms);
  const lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t;
  const d = (297.8501921 + 445267.1114034 * t - 0.0018819 * t * t) * RAD;
  const m = (357.5291092 + 35999.0502909 * t) * RAD;
  const mp = (134.9633964 + 477198.8675055 * t + 0.0087414 * t * t) * RAD;
  const f = (93.272095 + 483202.0175233 * t - 0.0036539 * t * t) * RAD;
  let lon = 0;
  let distance = 0;
  for (const [a, b, c, e, l, r] of LON_DIST) {
    const arg = a * d + b * m + c * mp + e * f;
    lon += l * Math.sin(arg);
    distance += r * Math.cos(arg);
  }
  let lat = 0;
  for (const [a, b, c, e, l] of LAT) lat += l * Math.sin(a * d + b * m + c * mp + e * f);
  return toEquatorial((lp + lon / 1e6) * RAD, (lat / 1e6) * RAD, 385000.56 + distance / 1000, t);
}

/** Local hour angle in radians, −π to π: zero when the body is on the meridian. */
export function hourAngle(position: Position, ms: number, lon: number): number {
  const days = (ms - J2000_MS) / DAY_MS;
  const sidereal = (280.46061837 + 360.98564736629 * days + lon) * RAD;
  return Math.atan2(Math.sin(sidereal - position.ra), Math.cos(sidereal - position.ra));
}

/** Altitude in degrees, seen from the surface (parallax matters for the Moon). */
export function altitude(position: Position, ms: number, place: Place): number {
  const phi = place.lat * RAD;
  const sinAlt =
    Math.sin(phi) * Math.sin(position.dec) +
    Math.cos(phi) * Math.cos(position.dec) * Math.cos(hourAngle(position, ms, place.lon));
  const cosAlt = Math.sqrt(Math.max(0, 1 - sinAlt * sinAlt));
  return Math.atan2(sinAlt - EARTH_RADIUS_KM / position.distanceKm, cosAlt) / RAD;
}

export const sunAltitude = (ms: number, place: Place) => altitude(sunPosition(ms), ms, place);
export const moonAltitude = (ms: number, place: Place) => altitude(moonPosition(ms), ms, place);

/** The lit share of the Moon, and whether it is growing. */
export function moonPhase(ms: number): { fraction: number; waxing: boolean } {
  const sun = sunPosition(ms);
  const moon = moonPosition(ms);
  const psi = Math.acos(Math.cos(moon.lat) * Math.cos(moon.lon - sun.lon));
  const angle = Math.atan2(
    sun.distanceKm * Math.sin(psi),
    moon.distanceKm - sun.distanceKm * Math.cos(psi),
  );
  return { fraction: (1 + Math.cos(angle)) / 2, waxing: Math.sin(moon.lon - sun.lon) > 0 };
}

/** When the Sun crosses an altitude on either side of noon. 'above' and 'below' mean that it
 *  stays on that side of it all day. */
export type Crossing = { rise: number; set: number } | 'above' | 'below';

const SUN_RATE = (2 * Math.PI) / DAY_MS;

/** The moment the Sun is due south (or north) nearest to `ms`. */
export function solarNoon(ms: number, lon: number): number {
  let t = ms;
  for (let i = 0; i < 3; i++) t -= hourAngle(sunPosition(t), t, lon) / SUN_RATE;
  return t;
}

export function sunCrossing(noon: number, place: Place, alt: number): Crossing {
  const phi = place.lat * RAD;
  const solve = (side: 1 | -1): number | 'above' | 'below' => {
    let t = noon;
    for (let i = 0; i < 5; i++) {
      const sun = sunPosition(t);
      const cosH =
        (Math.sin(alt * RAD) - Math.sin(phi) * Math.sin(sun.dec)) / (Math.cos(phi) * Math.cos(sun.dec));
      if (cosH > 1) return 'below';
      if (cosH < -1) return 'above';
      t = noon + (side * Math.acos(cosH)) / SUN_RATE;
    }
    return t;
  };
  const rise = solve(-1);
  const set = solve(1);
  if (typeof rise === 'string') return rise;
  if (typeof set === 'string') return set;
  return { rise, set };
}

/** The spans between `from` and `to` when the Moon is above the horizon. */
export function moonUpSpans(from: number, to: number, place: Place): [number, number][] {
  const spans: [number, number][] = [];
  if (to <= from) return spans;
  const steps = Math.max(1, Math.ceil((to - from) / HOUR_MS));
  const at = (i: number) => from + ((to - from) * i) / steps;
  let start = moonAltitude(from, place) > 0 ? from : null;
  for (let i = 1; i <= steps; i++) {
    const up = moonAltitude(at(i), place) > 0;
    if (up === (start !== null)) continue;
    const edge = bisect(at(i - 1), at(i), (t) => moonAltitude(t, place) > 0 === up);
    if (up) start = edge;
    else {
      spans.push([start!, edge]);
      start = null;
    }
  }
  if (start !== null) spans.push([start, to]);
  return spans;
}

/** The first moment `test` holds, to within half a minute, given that it fails at `lo` and
 *  holds at `hi`. */
function bisect(lo: number, hi: number, test: (t: number) => boolean): number {
  while (hi - lo > 30_000) {
    const mid = (lo + hi) / 2;
    if (test(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Apparent distance between the centers of the Sun and Moon in degrees, seen from a place. */
export function sunMoonSeparation(ms: number, place: Place): number {
  const phi = place.lat * RAD;
  const toVector = (p: Position) => {
    const h = hourAngle(p, ms, place.lon);
    // Axes: meridian on the equator, west, north pole; then move from Earth's center.
    return [
      p.distanceKm * Math.cos(p.dec) * Math.cos(h) - EARTH_RADIUS_KM * Math.cos(phi),
      p.distanceKm * Math.cos(p.dec) * Math.sin(h),
      p.distanceKm * Math.sin(p.dec) - EARTH_RADIUS_KM * Math.sin(phi),
    ] as const;
  };
  const a = toVector(sunPosition(ms));
  const b = toVector(moonPosition(ms));
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))) / RAD;
}
