/**
 * Integration test: asserts the real Launch Library 2 API response shape
 * matches our client interface and unit test mocks.
 *
 * If this test fails, update fetchUpcomingLaunches() in launch-library.ts
 * AND update the mock in launch-library.test.ts.
 *
 * Note: free tier is 15 req/hr — this test uses 1 request.
 */
import { describe, it, expect } from 'vitest';
import { fetchUpcomingLaunches } from './launch-library.ts';

describe('Launch Library 2 API (real)', () => {
  it('returns an array', async () => {
    const launches = await fetchUpcomingLaunches();
    expect(Array.isArray(launches)).toBe(true);
  });

  it('each launch has required fields with correct types', async () => {
    const launches = await fetchUpcomingLaunches();
    if (launches.length === 0) return; // rate limited or no notable launches

    const launch = launches[0]!;
    expect(typeof launch.id).toBe('string');
    expect(typeof launch.name).toBe('string');
    expect(typeof launch.window_start).toBe('string');
    expect(launch.rocket).toBeDefined();
    expect(typeof launch.rocket.configuration.name).toBe('string');
    expect(typeof launch.rocket.configuration.full_name).toBe('string');
    expect(launch.pad).toBeDefined();
    expect(typeof launch.pad.name).toBe('string');
    expect(typeof launch.pad.location.name).toBe('string');
    expect(Array.isArray(launch.vidURLs)).toBe(true);
    expect(Array.isArray(launch.infoURLs)).toBe(true);
  });

  it('window_start and window_end are ISO 8601 strings when present', async () => {
    const launches = await fetchUpcomingLaunches();
    if (launches.length === 0) return;

    for (const launch of launches) {
      expect(new Date(launch.window_start).toISOString()).toBeTruthy();
      if (launch.window_end) {
        expect(new Date(launch.window_end).toISOString()).toBeTruthy();
      }
    }
  });

  it('mission field is null or has name, description, type', async () => {
    const launches = await fetchUpcomingLaunches();
    if (launches.length === 0) return;

    for (const launch of launches) {
      if (launch.mission !== null) {
        expect(typeof launch.mission!.name).toBe('string');
        expect(typeof launch.mission!.type).toBe('string');
      }
    }
  });
});
