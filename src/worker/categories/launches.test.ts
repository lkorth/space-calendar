import { describe, it, expect, vi, beforeEach } from 'vitest';
import { launchesCategory } from './launches.ts';
import type { LL2Launch } from '../clients/launch-library.ts';

function makeKV(store: Record<string, string> = {}) {
  return {
    get: (key: string) => Promise.resolve(store[key] ?? null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

const LAUNCH: LL2Launch = {
  id: 'abc',
  name: 'Falcon Heavy | Test',
  status: { abbrev: 'Go', name: 'Go for Launch' },
  net: '2026-11-01T12:00:00Z',
  window_start: '2026-11-01T12:00:00Z',
  window_end: '2026-11-01T13:00:00Z',
  rocket: { configuration: { name: 'Falcon Heavy', full_name: 'Falcon Heavy' } },
  mission: { name: 'Test', description: 'A test mission.', type: 'Communications' },
  launch_service_provider: { name: 'SpaceX', type: 'Commercial' },
  pad: { name: 'LC-39A', location: { name: 'Kennedy Space Center' } },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ count: 1, next: null, results: [LAUNCH] }),
  }));
});

describe('launchesCategory', () => {
  it('serves cached events from KV without calling the API', async () => {
    const cached = [{ uid: 'cached', title: '🚀 Cached', category: 'launches' }];
    const env = { CALENDAR_KV: makeKV({ launches: JSON.stringify(cached) }) as unknown as KVNamespace };
    const { events } = await launchesCategory.fetch(env, { categories: ['launches'] });
    expect(events).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('versions the KV key with the deploy ID', async () => {
    const kv = makeKV({ launches: 'written by a previous deploy' });
    const env = { CALENDAR_KV: kv as unknown as KVNamespace, DEPLOY_ID: 'abc1234' };
    const { events } = await launchesCategory.fetch(env, { categories: ['launches'] });
    expect(events).toHaveLength(1);
    expect(kv.put).toHaveBeenCalledWith('launches:abc1234', expect.any(String), { expirationTtl: 3600 });
  });
});
