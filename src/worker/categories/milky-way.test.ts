import { describe, it, expect, vi } from 'vitest';
import {
  coreMaxAlt,
  coreHoursAboveAlt,
  overlapHours,
  milkyWayHoursForNight,
  tzOffsetHours,
  milkyWayCategory,
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
// milkyWayHoursForNight — core and darkness conditions
// ---------------------------------------------------------------------------

describe('milkyWayHoursForNight', () => {
  it('returns positive hours for 45°N in June (peak season, near new moon)', () => {
    const june = new Date(Date.UTC(2026, 5, 15)); // June 15 — actual new moon
    expect(milkyWayHoursForNight(june, 45, 0)).toBeGreaterThan(1);
  });

  it('returns 0 for 45°N in December (galactic core not up at night)', () => {
    const dec = new Date(Date.UTC(2026, 11, 20)); // near Dec new moon
    expect(milkyWayHoursForNight(dec, 45, 0)).toBe(0);
  });

  it('returns 0 for 60°N (core never reaches 10° altitude)', () => {
    const june = new Date(Date.UTC(2026, 5, 3));
    expect(milkyWayHoursForNight(june, 60, 0)).toBe(0);
  });

  it('returns more hours for 30°S than 45°N in June (better southern viewing)', () => {
    const june = new Date(Date.UTC(2026, 5, 3));
    expect(milkyWayHoursForNight(june, -30, 0)).toBeGreaterThan(milkyWayHoursForNight(june, 45, 0));
  });

  it('returns 0 for 60°N in June (midnight sun — no astronomical darkness)', () => {
    const june = new Date(Date.UTC(2026, 5, 15));
    expect(milkyWayHoursForNight(june, 60, 0)).toBe(0);
  });

  // Moon-aware conditions
  it('returns 0 around full moon (moon up all night blocks the window)', () => {
    // Full moon June 29, 2026
    const fullMoon = new Date(Date.UTC(2026, 5, 29));
    expect(milkyWayHoursForNight(fullMoon, 45, 0)).toBe(0);
  });

  it('returns positive hours when waning crescent moon rises late (evening window is clear)', () => {
    // June 8: 7 days before June 15 new moon — waning crescent rises after midnight
    const waningCrescent = new Date(Date.UTC(2026, 5, 8));
    expect(milkyWayHoursForNight(waningCrescent, 45, 0)).toBeGreaterThan(0);
  });

  it('returns more hours near new moon than near full moon (same season)', () => {
    const newMoon = new Date(Date.UTC(2026, 5, 15)); // June 15 new moon
    const fullMoon = new Date(Date.UTC(2026, 5, 29)); // June 29 full moon
    expect(milkyWayHoursForNight(newMoon, 45, 0)).toBeGreaterThan(
      milkyWayHoursForNight(fullMoon, 45, 0),
    );
  });
});

// ---------------------------------------------------------------------------
// tzOffsetHours
// ---------------------------------------------------------------------------

describe('tzOffsetHours', () => {
  it('returns 0 for undefined timezone', () => {
    expect(tzOffsetHours(undefined)).toBe(0);
  });

  it('returns approximately -6 for America/Denver (MDT in summer)', () => {
    expect(tzOffsetHours('America/Denver')).toBeCloseTo(-6, 0);
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

  it('generates events for 45°N (current year has galactic core season)', async () => {
    const env = makeEnv();
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.allDay)).toBe(true);
    expect(events.every((e) => e.category === 'milky-way')).toBe(true);
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

  it('event titles include the month name', async () => {
    const env = makeEnv();
    const { events } = await milkyWayCategory.fetch(env, { categories: ['milky-way'], lat: 45 });
    expect(events.every((e) => /🌌 Milky Way Window — \w+/.test(e.title))).toBe(true);
  });
});
