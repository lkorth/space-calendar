import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findOppositions, findGreatestElongations, fetchWithRetry } from './jpl.ts';
import type { EphemerisEntry } from './jpl.ts';

function makeEntries(values: Array<[string, number, 'T' | 'L']>): EphemerisEntry[] {
  return values.map(([date, elongation, direction]) => ({ date, elongation, direction }));
}

describe('findOppositions', () => {
  it('finds an opposition when elongation peaks above 170°', () => {
    const entries = makeEntries([
      ['2026-01-08', 177.3, 'L'],
      ['2026-01-09', 178.4, 'L'],
      ['2026-01-10', 179.5, 'L'],
      ['2026-01-11', 179.2, 'T'],
      ['2026-01-12', 178.1, 'T'],
    ]);
    const results = findOppositions(entries);
    expect(results).toHaveLength(1);
    expect(results[0]?.date).toBe('2026-01-10');
    expect(results[0]?.elongation).toBeCloseTo(179.5);
  });

  it('returns no opposition when peak is below 170°', () => {
    // Mars in 2026 — no opposition this year
    const entries = makeEntries([
      ['2026-01-01', 2.3, 'T'],
      ['2026-06-01', 85.0, 'L'],
      ['2026-12-31', 150.0, 'L'],
    ]);
    expect(findOppositions(entries)).toHaveLength(0);
  });

  it('finds multiple oppositions in the same year', () => {
    const entries = makeEntries([
      ['2026-01-09', 178.0, 'L'],
      ['2026-01-10', 179.5, 'L'],  // opposition 1
      ['2026-01-11', 178.0, 'T'],
      ['2026-06-01', 150.0, 'L'],
      ['2026-09-14', 178.0, 'L'],
      ['2026-09-15', 179.8, 'L'],  // opposition 2
      ['2026-09-16', 178.0, 'T'],
    ]);
    expect(findOppositions(entries)).toHaveLength(2);
  });

  it('does not treat the first or last entry as a peak', () => {
    const entries = makeEntries([
      ['2026-01-01', 180.0, 'L'], // would be peak but at index 0
      ['2026-01-02', 179.0, 'T'],
      ['2026-01-03', 178.0, 'T'],
    ]);
    expect(findOppositions(entries)).toHaveLength(0);
  });
});

describe('findGreatestElongations', () => {
  it('finds a greatest eastern elongation', () => {
    const entries = makeEntries([
      ['2026-02-18', 16.0, 'T'],
      ['2026-02-19', 17.5, 'T'],
      ['2026-02-20', 18.1, 'T'], // peak
      ['2026-02-21', 17.8, 'T'],
      ['2026-02-22', 16.9, 'T'],
    ]);
    const results = findGreatestElongations(entries, 18);
    expect(results).toHaveLength(1);
    expect(results[0]?.date).toBe('2026-02-20');
    expect(results[0]?.direction).toBe('T');
  });

  it('finds a greatest western elongation', () => {
    const entries = makeEntries([
      ['2026-04-02', 25.0, 'L'],
      ['2026-04-03', 27.5, 'L'],
      ['2026-04-04', 27.8, 'L'], // peak
      ['2026-04-05', 27.1, 'L'],
      ['2026-04-06', 25.0, 'L'],
    ]);
    const results = findGreatestElongations(entries, 18);
    expect(results).toHaveLength(1);
    expect(results[0]?.direction).toBe('L');
  });

  it('ignores peaks below the minimum elongation threshold', () => {
    // Near-conjunction small peak — should be filtered out
    const entries = makeEntries([
      ['2026-03-01', 5.0, 'T'],
      ['2026-03-02', 8.0, 'T'],
      ['2026-03-03', 10.0, 'T'], // peak but below Mercury's 18° threshold
      ['2026-03-04', 8.0, 'T'],
      ['2026-03-05', 5.0, 'T'],
    ]);
    expect(findGreatestElongations(entries, 18)).toHaveLength(0);
  });

  it('finds multiple elongations in the same year', () => {
    const entries = makeEntries([
      ['2026-02-19', 17.0, 'T'],
      ['2026-02-20', 18.1, 'T'], // first eastern
      ['2026-02-21', 17.0, 'T'],
      ['2026-04-03', 27.0, 'L'],
      ['2026-04-04', 27.8, 'L'], // first western
      ['2026-04-05', 27.0, 'L'],
    ]);
    expect(findGreatestElongations(entries, 18)).toHaveLength(2);
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns a successful response without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com');
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 and succeeds on the next attempt', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com');
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns the error response after exhausting all retries', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com', 2);
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on non-transient errors like 404', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com');
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
