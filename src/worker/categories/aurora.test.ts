import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auroraCategory } from './aurora.ts';
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

describe('auroraCategory', () => {
  it('returns empty array when lat param is missing', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    const events = await auroraCategory.fetch(env, { categories: ['aurora'] });
    expect(events).toHaveLength(0);
  });

  it('returns events when Kp meets threshold for the given latitude', async () => {
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    // lat=45 needs Kp >= 6, forecast has Kp 7 for two periods
    const events = await auroraCategory.fetch(env, { categories: ['aurora'], lat: 45 });
    expect(events.length).toBeGreaterThan(0);
  });

  it('returns no events when Kp never meets the threshold', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(QUIET_FORECAST),
    }));
    const env = { CALENDAR_KV: makeKV() as unknown as KVNamespace };
    // lat=45 needs Kp >= 6, quiet forecast only reaches Kp 2
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
    // Fetch should not have been called — served from cache
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
});
