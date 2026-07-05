import { describe, it, expect, vi } from 'vitest';
import {
  coreMaxAlt,
  coreHoursAboveAlt,
  overlapHours,
  milkyWayWindowForNight,
  tzOffsetHours,
  milkyWayCategory,
  minCoreAltDeg,
} from './milky-way.ts';

// ---------------------------------------------------------------------------
// Astronomy helpers
// ---------------------------------------------------------------------------

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
  it('opens the window only once the sun crosses 18° below the horizon', () => {
    // 30°S, new moon (June 15, 2026): confirmed sun-limited window start at this
    // latitude/date (core and moon are already satisfied well before the sun is).
    const date = new Date(Date.UTC(2026, 5, 15));
    const result = milkyWayWindowForNight(date, -30, 0);
    expect(result).not.toBeNull();

    const atStart = sunAltitudeDeg(date, result!.startHour, -30, 0);
    const justBeforeStart = sunAltitudeDeg(date, result!.startHour - 0.25, -30, 0);

    // The included sample must already be at/past -18°; the excluded sample
    // one step earlier must not yet be. A regression to -12° or -6° would put
    // both readings on the same side of that threshold.
    expect(atStart).toBeLessThanOrEqual(-18);
    expect(atStart).toBeGreaterThan(-21.5); // stays within one scan step of -18°
    expect(justBeforeStart).toBeGreaterThan(-18);
  });
});

// ---------------------------------------------------------------------------
// tzOffsetHours
// ---------------------------------------------------------------------------

describe('tzOffsetHours', () => {
  it('returns 0 for undefined timezone', () => {
    expect(tzOffsetHours(undefined)).toBe(0);
  });

  it('returns the standard-time offset (-7) for America/Denver, not the DST offset (-6)', () => {
    // Longitude approximation must use the fixed geographic meridian, not the
    // DST-shifted clock offset, or summer computations would place the observer
    // ~15° too far east and shift dark-sky timings roughly an hour too early.
    expect(tzOffsetHours('America/Denver')).toBeCloseTo(-7, 0);
  });

  it('returns 0 for UTC', () => {
    expect(tzOffsetHours('UTC')).toBe(0);
  });

  it('returns 0 for unknown timezone', () => {
    expect(tzOffsetHours('Not/ATimezone')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Category fetch
// ---------------------------------------------------------------------------

function makeEnv(store: Record<string, string> = {}) {
  return {
    CALENDAR_KV: {
      get: (key: string) => Promise.resolve(store[key] ?? null),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
  };
}

describe('milkyWayCategory.fetch', () => {
  it('returns empty array when lat is not provided', async () => {
    const { events } = await milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'] });
    expect(events).toEqual([]);
  });

  it('returns empty array for lat too far north (60°N)', async () => {
    const { events } = await milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 60 });
    expect(events).toEqual([]);
  });

  it('returns cached result without recomputing', async () => {
    const cached = [{ uid: 'cached', title: '🌌 Cached', category: 'milky-way' }];
    const env = makeEnv({ 'milky-way:45': JSON.stringify(cached) });
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events).toEqual(cached);
  });

  it('generates timed (not all-day) events for 45°N', async () => {
    const env = makeEnv();
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.allDay === false)).toBe(true);
    expect(events.every((e) => e.category === 'milky-way')).toBe(true);
  });

  it('event start and end are valid ISO datetime strings', async () => {
    const env = makeEnv();
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(new Date(e.start).getTime()).not.toBeNaN();
      expect(new Date(e.end).getTime()).not.toBeNaN();
      expect(new Date(e.start).getTime()).toBeLessThan(new Date(e.end).getTime());
    }
  });

  it('generates more events for 30°S than 45°N (wider season and moon windows)', async () => {
    const [north, south] = await Promise.all([
      milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 45 }),
      milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: -30 }),
    ]);
    expect(south.events.length).toBeGreaterThanOrEqual(north.events.length);
  });

  it('stores computed events in KV with 24h TTL', async () => {
    const env = makeEnv();
    await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect((env.CALENDAR_KV.put as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'milky-way:45',
      expect.any(String),
      { expirationTtl: 86400 },
    );
  });

  it('event titles are "🌌 Milky Way Viewing"', async () => {
    const env = makeEnv();
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.every((e) => e.title === '🌌 Milky Way Viewing')).toBe(true);
  });
});
