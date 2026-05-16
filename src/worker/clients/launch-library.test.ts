import { describe, it, expect } from 'vitest';
import { isNotable } from './launch-library.ts';
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
