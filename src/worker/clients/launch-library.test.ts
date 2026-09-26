import { describe, it, expect, vi } from 'vitest';
import { isNotable, hasUsableDate, fetchUpcomingLaunches } from './launch-library.ts';
import type { LL2Launch } from './launch-library.ts';

function makeLaunch(overrides: Partial<LL2Launch> = {}): LL2Launch {
  return {
    id: 'test-id',
    name: 'Test Launch',
    status: { abbrev: 'Go', name: 'Go for Launch' },
    net: '2026-01-01T00:00:00Z',
    window_start: '2026-01-01T00:00:00Z',
    window_end: '2026-01-01T01:00:00Z',
    rocket: { configuration: { name: 'Falcon 9', full_name: 'Falcon 9 Block 5' } },
    mission: { name: 'Test Mission', description: 'A test mission.', type: 'Communications' },
    launch_service_provider: { name: 'SpaceX', type: 'Commercial' },
    pad: { name: 'LC-39A', location: { name: 'Kennedy Space Center' } },
    vidURLs: [],
    infoURLs: [],
    ...overrides,
  };
}

describe('isNotable', () => {
  it('includes crewed missions', () => {
    expect(isNotable(makeLaunch({ mission: { name: 'Crew-10', description: 'Crewed mission to ISS.', type: 'Human Exploration' } }))).toBe(true);
  });

  it('includes Falcon Heavy launches', () => {
    expect(isNotable(makeLaunch({ rocket: { configuration: { name: 'Falcon Heavy', full_name: 'Falcon Heavy' } } }))).toBe(true);
  });

  it('includes Starship launches', () => {
    expect(isNotable(makeLaunch({ rocket: { configuration: { name: 'Starship', full_name: 'SpaceX Starship' } } }))).toBe(true);
  });

  it('includes SLS launches', () => {
    expect(isNotable(makeLaunch({ rocket: { configuration: { name: 'SLS Block 1B', full_name: 'Space Launch System Block 1B' } } }))).toBe(true);
  });

  it('includes New Glenn launches', () => {
    expect(isNotable(makeLaunch({ rocket: { configuration: { name: 'New Glenn', full_name: 'New Glenn' } } }))).toBe(true);
  });

  it('includes maiden/debut flights', () => {
    expect(isNotable(makeLaunch({ name: 'New Rocket | First Flight' }))).toBe(true);
    expect(isNotable(makeLaunch({ name: 'Starship | Maiden Flight' }))).toBe(true);
  });

  it('includes flagship science payloads by description', () => {
    expect(isNotable(makeLaunch({
      mission: { name: 'Roman Space Telescope', description: 'NASA flagship space telescope mission to survey the universe.', type: 'Astrophysics' },
    }))).toBe(true);
  });

  it('includes Mars missions', () => {
    expect(isNotable(makeLaunch({
      mission: { name: 'Mars Sample Return', description: 'Mission to return Mars samples to Earth.', type: 'Planetary Science' },
    }))).toBe(true);
  });

  it('excludes routine Starlink batches', () => {
    expect(isNotable(makeLaunch({
      name: 'Falcon 9 | Starlink Group 10-1',
      mission: { name: 'Starlink Group 10-1', description: 'Batch of Starlink internet satellites.', type: 'Communications' },
    }))).toBe(false);
  });

  it('excludes routine GEO comsats', () => {
    expect(isNotable(makeLaunch({
      name: 'Falcon 9 | SES-25',
      mission: { name: 'SES-25', description: 'Commercial geostationary communications satellite.', type: 'Communications' },
    }))).toBe(false);
  });

  it('excludes routine cargo resupply', () => {
    expect(isNotable(makeLaunch({
      name: 'Falcon 9 | CRS-32',
      mission: { name: 'CRS-32', description: 'Commercial resupply services mission to the ISS.', type: 'Resupply' },
    }))).toBe(false);
  });
});

describe('hasUsableDate', () => {
  const precision = (id: number, name: string) => ({ id, name, abbrev: name, description: '' });

  it('includes launches with day-or-finer precision', () => {
    expect(hasUsableDate(makeLaunch({ net_precision: precision(0, 'Second') }))).toBe(true);
    expect(hasUsableDate(makeLaunch({ net_precision: precision(5, 'Day') }))).toBe(true);
  });

  it('includes launches with week precision', () => {
    expect(hasUsableDate(makeLaunch({ net_precision: precision(6, 'Week') }))).toBe(true);
  });

  it('includes launches with month precision', () => {
    expect(hasUsableDate(makeLaunch({ net_precision: precision(7, 'Month') }))).toBe(true);
  });

  it('excludes launches with quarter, half-year, year, fiscal-year, or decade precision', () => {
    expect(hasUsableDate(makeLaunch({ net_precision: precision(9, 'Quarter 2') }))).toBe(false);
    expect(hasUsableDate(makeLaunch({ net_precision: precision(12, 'Year Half 1') }))).toBe(false);
    expect(hasUsableDate(makeLaunch({ net_precision: precision(14, 'Year') }))).toBe(false);
    expect(hasUsableDate(makeLaunch({ net_precision: precision(15, 'Fiscal Year') }))).toBe(false);
    expect(hasUsableDate(makeLaunch({ net_precision: precision(16, 'Decade') }))).toBe(false);
  });

  it('includes launches with no precision reported', () => {
    expect(hasUsableDate(makeLaunch({ net_precision: null }))).toBe(true);
    expect(hasUsableDate(makeLaunch())).toBe(true);
  });
});

describe('fetchUpcomingLaunches', () => {
  it('drops notable launches whose date is coarser than month precision', async () => {
    const heavy = { configuration: { name: 'Falcon Heavy', full_name: 'Falcon Heavy' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        count: 2,
        next: null,
        results: [
          makeLaunch({ id: 'month', rocket: heavy, net_precision: { id: 7, name: 'Month', abbrev: 'M', description: '' } }),
          makeLaunch({ id: 'fy', rocket: heavy, net_precision: { id: 15, name: 'Fiscal Year', abbrev: 'FY', description: '' } }),
        ],
      }),
    }));
    const result = await fetchUpcomingLaunches();
    expect(result?.map((l) => l.id)).toEqual(['month']);
  });

  it('returns null on 429 instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const result = await fetchUpcomingLaunches();
    expect(result).toBeNull();
  });

  it('throws on other non-ok status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchUpcomingLaunches()).rejects.toThrow('Launch Library 2 error 503');
  });
});
