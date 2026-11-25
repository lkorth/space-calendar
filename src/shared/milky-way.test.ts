import { describe, it, expect } from 'vitest';
import {
  coreHoursAboveAlt, coreMaxAlt, milkyWayWindowForNight, minCoreAltDeg, overlapHours,
} from './milky-way.ts';

describe('coreMaxAlt', () => {
  it('returns ~16° at 45°N', () => {
    expect(coreMaxAlt(45)).toBeCloseTo(16, 0);
  });

  it('returns ~31° at 30°N', () => {
    expect(coreMaxAlt(30)).toBeCloseTo(31, 0);
  });

  it('returns ~89° at 30°S (near-overhead)', () => {
    expect(coreMaxAlt(-30)).toBeCloseTo(89, 0);
  });

  it('returns ~1° at 60°N (barely above horizon)', () => {
    expect(coreMaxAlt(60)).toBeCloseTo(1, 0);
  });
});

describe('minCoreAltDeg', () => {
  it('returns 14° at 43°N and above', () => {
    expect(minCoreAltDeg(43)).toBe(14);
    expect(minCoreAltDeg(55)).toBe(14);
  });

  it('returns 18° below 43°N', () => {
    expect(minCoreAltDeg(42)).toBe(18);
    expect(minCoreAltDeg(30)).toBe(18);
    expect(minCoreAltDeg(0)).toBe(18);
  });

  it('applies the same threshold to southern latitudes by absolute value', () => {
    expect(minCoreAltDeg(-43)).toBe(14);
    expect(minCoreAltDeg(-42)).toBe(18);
  });
});

describe('coreHoursAboveAlt', () => {
  it('returns 0 at 60°N above 10° (core never reaches threshold)', () => {
    expect(coreHoursAboveAlt(10, 60)).toBe(0);
  });

  it('returns positive hours at 45°N above 10°', () => {
    const hours = coreHoursAboveAlt(10, 45);
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThan(24);
  });

  it('returns more hours at 30°S than at 45°N', () => {
    expect(coreHoursAboveAlt(10, -30)).toBeGreaterThan(coreHoursAboveAlt(10, 45));
  });
});

describe('overlapHours', () => {
  it('returns full overlap when windows are identical', () => {
    expect(overlapHours(22, 4, 22, 4)).toBeCloseTo(6, 1);
  });

  it('returns 0 when windows do not overlap', () => {
    expect(overlapHours(8, 12, 14, 18)).toBe(0);
  });

  it('returns partial overlap for partially-overlapping midnight-spanning windows', () => {
    // dark: 22–02, core: 23–03 → overlap 23–02 = 3h
    expect(overlapHours(22, 2, 23, 3)).toBeCloseTo(3, 1);
  });

  it('handles non-wrapping windows', () => {
    // 10–14 and 12–16 → overlap 12–14 = 2h
    expect(overlapHours(10, 14, 12, 16)).toBeCloseTo(2, 1);
  });
});

// ---------------------------------------------------------------------------
// milkyWayWindowForNight
// ---------------------------------------------------------------------------

describe('milkyWayWindowForNight', () => {
  it('returns a window for 45°N in June near new moon', () => {
    const june = new Date(Date.UTC(2026, 5, 15)); // June 15 — actual new moon
    const result = milkyWayWindowForNight(june, 45, 0);
    expect(result).not.toBeNull();
    expect(result!.hours).toBeGreaterThan(1);
  });

  it('returns null for 45°N in December (galactic core not up at night)', () => {
    const dec = new Date(Date.UTC(2026, 11, 20));
    expect(milkyWayWindowForNight(dec, 45, 0)).toBeNull();
  });

  it('returns null for 60°N (core never reaches minimum altitude threshold)', () => {
    const june = new Date(Date.UTC(2026, 5, 3));
    expect(milkyWayWindowForNight(june, 60, 0)).toBeNull();
  });

  it('returns more hours for 30°S than 45°N in June (better southern viewing)', () => {
    const june = new Date(Date.UTC(2026, 5, 15)); // June 15 — actual new moon
    const north = milkyWayWindowForNight(june, 45, 0);
    const south = milkyWayWindowForNight(june, -30, 0);
    expect(south).not.toBeNull();
    expect(north).not.toBeNull();
    expect(south!.hours).toBeGreaterThan(north!.hours);
  });

  it('returns null for 60°N in June (midnight sun — no astronomical darkness)', () => {
    const june = new Date(Date.UTC(2026, 5, 15));
    expect(milkyWayWindowForNight(june, 60, 0)).toBeNull();
  });

  it('returns null around full moon (moon up all night blocks the window)', () => {
    // Full moon June 29, 2026
    const fullMoon = new Date(Date.UTC(2026, 5, 29));
    expect(milkyWayWindowForNight(fullMoon, 45, 0)).toBeNull();
  });

  it('returns a window when waning crescent moon rises late (evening window is clear)', () => {
    // June 8: 7 days before June 15 new moon — waning crescent rises after midnight
    const waningCrescent = new Date(Date.UTC(2026, 5, 8));
    expect(milkyWayWindowForNight(waningCrescent, 45, 0)).not.toBeNull();
  });

  it('returns more hours near new moon than near full moon (same season)', () => {
    const newMoon = new Date(Date.UTC(2026, 5, 15));
    const fullMoon = new Date(Date.UTC(2026, 5, 29));
    const newMoonWindow = milkyWayWindowForNight(newMoon, 45, 0);
    const fullMoonWindow = milkyWayWindowForNight(fullMoon, 45, 0);
    expect(newMoonWindow).not.toBeNull();
    expect(newMoonWindow!.hours).toBeGreaterThan(fullMoonWindow?.hours ?? 0);
  });

  it('returns startHour and endHour that span the window duration', () => {
    const june = new Date(Date.UTC(2026, 5, 15));
    const result = milkyWayWindowForNight(june, 45, 0);
    expect(result).not.toBeNull();
    expect(result!.endHour - result!.startHour).toBeCloseTo(result!.hours, 0);
  });

  it('startHour and endHour produce valid UTC timestamps', () => {
    const date = new Date(Date.UTC(2026, 5, 15));
    const result = milkyWayWindowForNight(date, 45, 0);
    expect(result).not.toBeNull();
    const start = new Date(date.getTime() + result!.startHour * 3600000);
    const end = new Date(date.getTime() + result!.endHour * 3600000);
    expect(start.getTime()).toBeLessThan(end.getTime());
    // Window should be on or after the given date
    expect(start.getTime()).toBeGreaterThanOrEqual(date.getTime());
  });
});

// ---------------------------------------------------------------------------
// Astronomical twilight threshold regression
//
// milkyWayWindowForNight requires the sun to be 18° below the horizon
// (astronomical twilight) before a window opens. This is deliberately checked
// against an independently-written solar altitude formula (not the source's
// own sunPosition/hourAngleAtAlt) so a regression to a shallower threshold
// (e.g. -12° nautical or -6° civil twilight) would be caught even if it were
// introduced consistently across the source file.
// ---------------------------------------------------------------------------

function sunAltitudeDeg(dateUTC: Date, hourUTC: number, lat: number, lon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = dateUTC.getUTCFullYear();
  const m = dateUTC.getUTCMonth() + 1;
  const d = dateUTC.getUTCDate();
  const jd = (() => {
    let yy = y, mm = m;
    if (mm <= 2) { yy--; mm += 12; }
    const A = Math.floor(yy / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + hourUTC / 24 + B - 1524.5;
  })();
  const n = jd - 2451545.0;
  const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
  const g = toRad(((357.528 + 0.9856003 * n) % 360 + 360) % 360);
  const lambda = toRad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const epsilon = toRad(23.439);
  const raHours = toDeg(Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda))) / 15;
  const dec = toDeg(Math.asin(Math.sin(epsilon) * Math.sin(lambda)));

  const T = n / 36525;
  const gmstDeg = 280.46061837 + 360.98564736629 * n + 0.000387933 * T * T;
  const lstHours = (((gmstDeg / 15) % 24 + 24) % 24 + lon / 15 + 24) % 24;
  const haHours = (((lstHours - raHours + 12) % 24 + 24) % 24) - 12;

  const latR = toRad(lat);
  const decR = toRad(dec);
  const haR = toRad(haHours * 15);
  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  return toDeg(Math.asin(sinAlt));
}

describe('astronomical twilight threshold', () => {
  // The window edges must land on the moment the limiting condition flips, not on the
  // nearest scan sample. A window that ends on a sample boundary can run up to a full
  // scan step past astronomical dawn, telling subscribers the sky is dark when it is not.
  // Tolerance covers the difference between this test's sun model and the worker's.
  const TOLERANCE_DEG = 0.5;

  it('opens the window when the sun crosses 18° below the horizon at dusk', () => {
    // 30°S, new moon (June 15, 2026): confirmed sun-limited window start at this
    // latitude/date (core and moon are already satisfied well before the sun is).
    const date = new Date(Date.UTC(2026, 5, 15));
    const result = milkyWayWindowForNight(date, -30, 0);
    expect(result).not.toBeNull();

    const atStart = sunAltitudeDeg(date, result!.startHour, -30, 0);
    expect(Math.abs(atStart + 18)).toBeLessThan(TOLERANCE_DEG);
  });

  it('closes the window when the sun climbs past 18° below the horizon at dawn', () => {
    // 40°N, 4°W (Madrid), April 15, 2027: the core rises late and the window is cut off
    // by astronomical dawn.
    const date = new Date(Date.UTC(2027, 3, 15));
    const result = milkyWayWindowForNight(date, 40, -4);
    expect(result).not.toBeNull();

    const atEnd = sunAltitudeDeg(date, result!.endHour, 40, -4);
    expect(Math.abs(atEnd + 18)).toBeLessThan(TOLERANCE_DEG);
  });

  it('reports hours matching the span between start and end', () => {
    for (const [lat, lon, day] of [[40, -4, '2027-04-15'], [-30, 150, '2027-06-05'], [-34, 18, '2027-07-02']] as const) {
      const w = milkyWayWindowForNight(new Date(`${day}T00:00:00Z`), lat, lon)!;
      expect(w.hours).toBeCloseTo(w.endHour - w.startHour, 2);
    }
  });
});
