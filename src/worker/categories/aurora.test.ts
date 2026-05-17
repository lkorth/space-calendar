import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auroraCategory, auroraAustralisCategory } from './aurora.ts';
import type { Env } from '../../shared/models.ts';

function makeKV(store: Record<string, string> = {}) {
  return {
    get: (key: string) => Promise.resolve(store[key] ?? null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

const STORM_FORECAST = [
  { time_tag: '2026-05-16 00:00:00', kp: 4, observed: 'observed', noaa_scale: null },
  { time_tag: '2026-05-16 03:00:00', kp: 7, observed: 'estimated', noaa_scale: 'G3' },
  { time_tag: '2026-05-16 06:00:00', kp: 7, observed: 'predicted', noaa_scale: 'G3' },
  { time_tag: '2026-05-16 09:00:00', kp: 6, observed: 'predicted', noaa_scale: 'G2' },
  { time_tag: '2026-05-16 12:00:00', kp: 3, observed: 'predicted', noaa_scale: null },
];

const QUIET_FORECAST = [
  { time_tag: '2026-05-16 00:00:00', kp: 1, observed: 'observed', noaa_scale: null },
  { time_tag: '2026-05-16 03:00:00', kp: 2, observed: 'estimated', noaa_scale: null },
  { time_tag: '2026-05-16 06:00:00', kp: 1, observed: 'predicted', noaa_scale: null },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(STORM_FORECAST),
  }));
});

describe('auroraCategory (Northern)', () => {
  it('returns empty array when lat param is missing', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'] });
    expect(events).toHaveLength(0);
  });

  it('returns events when Kp meets threshold for the given latitude', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events.length).toBeGreaterThan(0);
  });

  it('returns no events when Kp never meets the threshold', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(QUIET_FORECAST),
    }));
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events).toHaveLength(0);
  });

  it('serves from KV cache when available', async () => {
    const cached = JSON.stringify([{
      uid: 'aurora-45-cached@space-calendar',
      title: 'Aurora Borealis — Strong Storm Likely',
      start: '2026-05-16T03:00:00Z',
      end: '2026-05-16T09:00:00Z',
      allDay: false,
      description: 'Cached aurora event.',
      category: 'aurora',
    }]);
    const kv = makeKV({ 'aurora:45': cached });
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores results in KV with the rounded latitude key', async () => {
    const kv = makeKV();
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(kv.put).toHaveBeenCalledWith(
      'aurora:45',
      expect.any(String),
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
  });

  it('rounds latitude to the nearest integer for cache key', async () => {
    const kv = makeKV();
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45.7 });
    expect(kv.put).toHaveBeenCalledWith('aurora:46', expect.any(String), expect.anything());
  });

  it('includes severity language in the event title', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events.some((e) => e.title.toLowerCase().includes('storm'))).toBe(true);
  });

  it('titles events as Aurora Borealis', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events.every((e) => e.title.startsWith('Aurora Borealis'))).toBe(true);
  });

  it('description says to look north', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events[0]!.description).toContain('Look north');
  });
});

describe('auroraAustralisCategory (Southern)', () => {
  it('returns empty array when lat param is missing', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraAustralisCategory.fetch(env, { categories: ['aurora-australis'] });
    expect(events).toHaveLength(0);
  });

  it('returns events for a southern latitude when Kp meets threshold', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    // lat=-45 (New Zealand) — same threshold as +45 northern (Kp 6); forecast has Kp 7
    const events = await auroraAustralisCategory.fetch(env, { categories: ['aurora-australis'], lat: -45 });
    expect(events.length).toBeGreaterThan(0);
  });

  it('titles events as Aurora Australis', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraAustralisCategory.fetch(env, { categories: ['aurora-australis'], lat: -45 });
    expect(events.every((e) => e.title.startsWith('Aurora Australis'))).toBe(true);
  });

  it('description says to look south', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraAustralisCategory.fetch(env, { categories: ['aurora-australis'], lat: -45 });
    expect(events[0]!.description).toContain('Look south');
  });

  it('uses the aurora-australis KV key prefix', async () => {
    const kv = makeKV();
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    await auroraAustralisCategory.fetch(env, { categories: ['aurora-australis'], lat: -45 });
    expect(kv.put).toHaveBeenCalledWith('aurora-australis:-45', expect.any(String), expect.anything());
  });

  it('uses absolute latitude for the Kp threshold so -45 and +45 have the same threshold', async () => {
    const kvN = makeKV();
    const kvS = makeKV();
    const envN = { CALENDAR_KV: kvN as unknown as KVNamespace };
    const envS = { CALENDAR_KV: kvS as unknown as KVNamespace };
    const northEvents = await auroraCategory.fetch(envN, { categories: ['aurora'], lat: 45 });
    const southEvents = await auroraAustralisCategory.fetch(envS, { categories: ['aurora-australis'], lat: -45 });
    // Same Kp threshold means same number of events for same forecast
    expect(southEvents.length).toBe(northEvents.length);
  });
});
