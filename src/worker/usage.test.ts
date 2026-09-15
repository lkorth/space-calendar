import { describe, it, expect, vi } from 'vitest';
import { recordUsage, usagePoint, USAGE_BLOBS, USAGE_DOUBLES } from './usage.ts';
import type { Env } from './types.ts';

const URL_WITH_ID =
  'https://space-calendar.lukekorth.com/feed.ics?c=moon-phases,aurora&lat=45&tz=America/Chicago&utm_source=ig&sid=01937b2c-0000-7000-8000-aaaaaaaaaaaa';

function makeRequest(url: string, init: RequestInit & { cf?: Record<string, unknown> } = {}): Request {
  const { cf, ...rest } = init;
  const request = new Request(url, rest);
  // Workers attach `cf` to the request at the edge; undici's Request has no such slot.
  return Object.assign(request, { cf }) as Request;
}

describe('usagePoint', () => {
  it('records who is asking, from where, and what they got', () => {
    const request = makeRequest(URL_WITH_ID, {
      headers: { 'User-Agent': 'iOS/26.0 dataaccessd/1.0', 'If-None-Match': '"abc"' },
      cf: { asOrganization: 'Comcast', asn: 7922, country: 'US', region: 'Illinois', city: 'Chicago', colo: 'ORD' },
    });

    const point = usagePoint(request, { status: 304, cacheHit: true });

    expect(point.indexes).toEqual(['01937b2c-0000-7000-8000-aaaaaaaaaaaa']);
    expect(Object.fromEntries(USAGE_BLOBS.map((name, i) => [name, point.blobs[i]]))).toEqual({
      sid: '01937b2c-0000-7000-8000-aaaaaaaaaaaa',
      url: URL_WITH_ID,
      path: '/feed.ics',
      utm_source: 'ig',
      user_agent: 'iOS/26.0 dataaccessd/1.0',
      network: 'Comcast',
      country: 'US',
      region: 'Illinois',
      city: 'Chicago',
      colo: 'ORD',
    });
    expect(Object.fromEntries(USAGE_DOUBLES.map((name, i) => [name, point.doubles[i]]))).toEqual({
      status: 304,
      asn: 7922,
      conditional: 1,
      cache_hit: 1,
    });
  });

  it('keeps every column present when the request carries nothing', () => {
    // Analytics Engine columns are positional: a missing blob would shift every later one
    // into the wrong column, so absent values are written as empty strings, never dropped.
    const point = usagePoint(makeRequest('https://space-calendar.lukekorth.com/feed.json?c=comets'), {
      status: 200,
      cacheHit: false,
    });

    expect(point.blobs).toHaveLength(USAGE_BLOBS.length);
    expect(point.doubles).toHaveLength(USAGE_DOUBLES.length);
    expect(point.indexes).toEqual(['']);
    expect(point.blobs[USAGE_BLOBS.indexOf('path')]).toBe('/feed.json');
    expect(point.blobs[USAGE_BLOBS.indexOf('sid')]).toBe('');
    expect(point.blobs[USAGE_BLOBS.indexOf('user_agent')]).toBe('');
    expect(point.doubles[USAGE_DOUBLES.indexOf('asn')]).toBe(0);
    expect(point.doubles[USAGE_DOUBLES.indexOf('conditional')]).toBe(0);
    expect(point.doubles[USAGE_DOUBLES.indexOf('cache_hit')]).toBe(0);
  });

  it('recovers a sid that a link rewriter swallowed into c=', () => {
    // The same double-encoding the params parser tolerates: without this the subscription
    // would be recorded as untagged and its start date lost.
    const request = makeRequest(
      'https://space-calendar.lukekorth.com/feed.ics?c=moon-phases%26sid%3D01937b2c-0000-7000-8000-aaaaaaaaaaaa&utm_source=chatgpt.com',
    );
    const point = usagePoint(request, { status: 200, cacheHit: false });
    expect(point.indexes).toEqual(['01937b2c-0000-7000-8000-aaaaaaaaaaaa']);
    expect(point.blobs[USAGE_BLOBS.indexOf('utm_source')]).toBe('chatgpt.com');
  });

  it('never records the client IP', () => {
    const request = makeRequest(URL_WITH_ID, {
      headers: { 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '203.0.113.9' },
      cf: { asOrganization: 'Comcast' },
    });
    const point = usagePoint(request, { status: 200, cacheHit: false });
    expect(JSON.stringify(point)).not.toContain('203.0.113.9');
  });
});

describe('recordUsage', () => {
  it('writes one data point to the bound dataset', () => {
    const writeDataPoint = vi.fn();
    const env = { USAGE: { writeDataPoint } } as unknown as Env;

    recordUsage(env, makeRequest(URL_WITH_ID), { status: 200, cacheHit: false });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint.mock.calls[0]![0].indexes).toEqual(['01937b2c-0000-7000-8000-aaaaaaaaaaaa']);
  });

  it('is a no-op without the binding, so local dev and tests need none', () => {
    expect(() => recordUsage({} as Env, makeRequest(URL_WITH_ID), { status: 200, cacheHit: false })).not.toThrow();
  });

  it('never lets an analytics failure reach the subscriber', () => {
    const env = {
      USAGE: {
        writeDataPoint: () => {
          throw new Error('dataset unavailable');
        },
      },
    } as unknown as Env;
    expect(() => recordUsage(env, makeRequest(URL_WITH_ID), { status: 200, cacheHit: false })).not.toThrow();
  });
});
