import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  coreMaxAlt,
  coreHoursAboveAlt,
  overlapHours,
  milkyWayWindowForNight,
  tzOffsetHours,
  milkyWayCategory,
  minCoreAltDeg,
  nightsInWindow,
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

describe('nightsInWindow', () => {
  const now = new Date('2026-09-26T15:30:00Z');

  it('starts at UTC midnight 6 months back and ends at UTC midnight 1 year ahead', () => {
    const nights = nightsInWindow(now);
    expect(nights[0]!.toISOString()).toBe('2026-03-26T00:00:00.000Z');
    expect(nights[nights.length - 1]!.toISOString()).toBe('2027-09-26T00:00:00.000Z');
  });

  it('returns consecutive days across the year boundary', () => {
    const nights = nightsInWindow(now);
    for (let i = 1; i < nights.length; i++) {
      expect(nights[i]!.getTime() - nights[i - 1]!.getTime()).toBe(24 * 60 * 60 * 1000);
    }
    expect(nights.map((d) => d.toISOString().slice(0, 10))).toContain('2027-01-01');
  });
});

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
    const env = makeEnv({ 'milky-way:45:0': JSON.stringify(cached) });
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
      'milky-way:45:0',
      expect.any(String),
      { expirationTtl: 86400 },
    );
  });

  it('versions the KV key with the deploy ID', async () => {
    const env = { ...makeEnv({ 'milky-way:45:0': 'written by a previous deploy' }), DEPLOY_ID: 'abc1234' };
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.length).toBeGreaterThan(0);
    expect((env.CALENDAR_KV.put as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'milky-way:45:0:abc1234',
      expect.any(String),
      { expirationTtl: 86400 },
    );
  });

  it('event titles are "🌌 Milky Way Viewing"', async () => {
    const env = makeEnv();
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.every((e) => e.title === '🌌 Milky Way Viewing')).toBe(true);
  });

  describe('observer longitude', () => {
    const put = (env: ReturnType<typeof makeEnv>) => env.CALENDAR_KV.put as ReturnType<typeof vi.fn>;

    it('uses the lon parameter when present', async () => {
      // Columbus, OH sits at -83°, 8° west of the -75° its timezone implies, so every
      // window starts 32 minutes (8° × 4 min) later in UTC than the tz estimate.
      const [fromTz, fromLon] = await Promise.all([
        milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 40, tz: 'America/New_York' }),
        milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 40, lon: -83, tz: 'America/New_York' }),
      ]);
      const tzByUid = new Map(fromTz.events.map((e) => [e.uid, e]));
      const shared = fromLon.events.filter((e) => tzByUid.has(e.uid));
      expect(shared.length).toBeGreaterThan(0);
      for (const e of shared) {
        const shiftMin = (new Date(e.start).getTime() - new Date(tzByUid.get(e.uid)!.start).getTime()) / 60000;
        expect(shiftMin).toBeGreaterThan(25);
        expect(shiftMin).toBeLessThan(40);
      }
    });

    it('falls back to the timezone estimate when lon is absent', async () => {
      const [fromTz, fromEquivalentLon] = await Promise.all([
        milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 40, tz: 'America/Denver' }),
        milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 40, lon: -105 }),
      ]);
      expect(fromTz.events).toEqual(fromEquivalentLon.events);
    });

    it('keys the KV cache by the longitude actually used', async () => {
      const withLon = makeEnv();
      const withTz = makeEnv();
      await milkyWayCategory.fetch(withLon, { categories: ['milky-way'], lat: 40, lon: -83, tz: 'America/New_York' });
      await milkyWayCategory.fetch(withTz, { categories: ['milky-way'], lat: 40, tz: 'America/Denver' });
      expect(put(withLon)).toHaveBeenCalledWith('milky-way:40:-83', expect.any(String), { expirationTtl: 86400 });
      expect(put(withTz)).toHaveBeenCalledWith('milky-way:40:-105', expect.any(String), { expirationTtl: 86400 });
    });
  });

  describe('rolling window', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-26T15:30:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    // Columbus, OH: the northern season ends in mid-August, so late in the year the feed
    // must already carry next spring's nights rather than stopping at December 31.
    it("includes next year's season for a northern subscriber late in the year", async () => {
      const { events } = await milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 40, tz: 'America/New_York' });
      expect(events.some((e) => e.start.startsWith('2027-'))).toBe(true);
    });

    it('keeps past nights from the last 6 months and nothing older', async () => {
      const { events } = await milkyWayCategory.fetch(makeEnv(), { categories: ['milky-way'], lat: 40, tz: 'America/New_York' });
      expect(events.some((e) => e.start.startsWith('2026-07-'))).toBe(true);
      expect(events.every((e) => e.start >= '2026-03-26')).toBe(true);
    });
  });
});
