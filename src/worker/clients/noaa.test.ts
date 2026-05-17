import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchKpForecast, kpThresholdForLatitude } from './noaa.ts';

describe('kpThresholdForLatitude', () => {
  it.each([
    [70, 1],
    [65, 1],
    [64, 3],
    [60, 3],
    [55, 3],
    [54, 5],
    [52, 5],
    [50, 5],
    [49, 6],
    [47, 6],
    [45, 6],
    [44, 7],
    [42, 7],
    [40, 7],
    [39, 8],
    [37, 8],
    [35, 8],
    [34, 9],
    [30, 9],
    [25, 9],
  ])('lat=%i → Kp %i', (lat, expected) => {
    expect(kpThresholdForLatitude(lat)).toBe(expected);
  });
});

describe('fetchKpForecast', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { time_tag: '2026-05-16 00:00:00', kp: 3, observed: 'observed', noaa_scale: null },
        { time_tag: '2026-05-16 03:00:00', kp: 5, observed: 'estimated', noaa_scale: 'G1' },
        { time_tag: '2026-05-16 06:00:00', kp: 7, observed: 'predicted', noaa_scale: 'G3' },
      ]),
    }));
  });

  it('returns all entries', async () => {
    const forecast = await fetchKpForecast();
    expect(forecast).toHaveLength(3);
  });

  it('parses kp as a number', async () => {
    const forecast = await fetchKpForecast();
    expect(forecast[0]?.kp).toBe(3);
    expect(forecast[1]?.kp).toBe(5);
    expect(forecast[2]?.kp).toBe(7);
  });

  it('parses observed/estimated/predicted correctly', async () => {
    const forecast = await fetchKpForecast();
    expect(forecast[0]?.observed).toBe('observed');
    expect(forecast[1]?.observed).toBe('estimated');
    expect(forecast[2]?.observed).toBe('predicted');
  });

  it('throws when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchKpForecast()).rejects.toThrow('503');
  });
});
