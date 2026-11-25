import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { milkyWayCategory, nightsInWindow, tzOffsetHours } from './milky-way.ts';

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
