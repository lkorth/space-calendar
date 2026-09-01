import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { SITE_URL } from './index.ts';
import type { CalendarEvent } from '../shared/models.ts';

beforeEach(() => {
  vi.stubGlobal('caches', {
    default: {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
  });
});

const moonEvent: CalendarEvent = {
  uid: 'moon-2026-01-01@space-calendar',
  title: 'Full Moon',
  start: '2026-01-01T12:00:00Z',
  end: '2026-01-01T12:00:00Z',
  allDay: false,
  description: 'Full moon tonight.',
  category: 'moon-phases',
};

const eclipseEvent: CalendarEvent = {
  uid: 'eclipse-2026-03-03@space-calendar',
  title: 'Total Lunar Eclipse — Blood Moon',
  start: '2026-03-03T08:45:00Z',
  end: '2026-03-03T14:23:00Z',
  allDay: false,
  description: 'Total lunar eclipse.',
  category: 'eclipses-lunar',
};

function makeKV(store: Record<string, string> = {}) {
  return {
    get: (key: string) => Promise.resolve(store[key] ?? null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRequest(url: string): Request {
  return new Request(url);
}

function makeEnv(store: Record<string, string> = {}) {
  return { CALENDAR_KV: makeKV(store) as unknown as KVNamespace };
}

describe('worker request routing', () => {
  it('redirects the root to the configurator', async () => {
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/'),
      makeEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(SITE_URL);
  });

  it('points the root redirect at a real, absolute https URL', async () => {
    // This previously pointed at space-calendar.pages.dev, which no longer resolves, so
    // the domain in every subscription URL 301'd visitors to a dead host.
    const target = new URL(SITE_URL);
    expect(target.protocol).toBe('https:');
    expect(target.hostname).not.toBe('space-calendar.pages.dev');
  });

  it('returns 404 for unknown paths', async () => {
    const res = await worker.fetch(makeRequest('https://space-calendar.workers.dev/unknown'), makeEnv(), { waitUntil: vi.fn() } as unknown as ExecutionContext);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no categories are specified', async () => {
    const res = await worker.fetch(makeRequest('https://space-calendar.workers.dev/feed.ics'), makeEnv(), { waitUntil: vi.fn() } as unknown as ExecutionContext);
    expect(res.status).toBe(400);
  });

  it('returns 200 with text/calendar content type for valid request', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
  });

  it('merges events from multiple categories', async () => {
    const env = makeEnv({
      'static:moon-phases': JSON.stringify([moonEvent]),
      'static:eclipses-lunar': JSON.stringify([eclipseEvent]),
    });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases,eclipses-lunar'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await res.text();
    expect(body).toContain('Full Moon');
    expect(body).toContain('Total Lunar Eclipse');
  });

  it('sorts events by start date', async () => {
    const env = makeEnv({
      'static:moon-phases': JSON.stringify([moonEvent]),
      'static:eclipses-lunar': JSON.stringify([eclipseEvent]),
    });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases,eclipses-lunar'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await res.text();
    const moonPos = body.indexOf('Full Moon');
    const eclipsePos = body.indexOf('Total Lunar Eclipse');
    // Moon (Jan 1) should appear before eclipse (Mar 3)
    expect(moonPos).toBeLessThan(eclipsePos);
  });

  it('returns valid ICS with BEGIN:VCALENDAR', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
  });

  it('returns 400 when latitude and hemisphere contradict each other', async () => {
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const env = makeEnv();
    const [res1, res2] = await Promise.all([
      worker.fetch(makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases&lat=-45&hemi=north'), env, ctx),
      worker.fetch(makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases&lat=45&hemi=south'), env, ctx),
    ]);
    expect(res1.status).toBe(400);
    expect(res2.status).toBe(400);
  });

  it('allows lat=0 with either hemisphere', async () => {
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const [res1, res2] = await Promise.all([
      worker.fetch(makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases&lat=0&hemi=north'), env, ctx),
      worker.fetch(makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases&lat=0&hemi=south'), env, ctx),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('ignores unknown category slugs gracefully', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases,not-a-real-category'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
  });

  it('sets Cache-Control header', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.headers.get('Cache-Control')).toBeTruthy();
  });

  it('expands legacy group slugs into their replacement categories', async () => {
    const env = makeEnv({
      'static:moon-phases': JSON.stringify([moonEvent]),
      'static:eclipses-lunar': JSON.stringify([eclipseEvent]),
    });
    // A subscription URL predating the split of the coarse groups into per-event slugs.
    // Static categories only — a live slug here would make this unit test hit the network.
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=sky-events,history'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('Full Moon');
    expect(body).toContain('Total Lunar Eclipse');
  });

  it('recovers parameters swallowed by a double-encoded URL', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest(
        'https://space-calendar.workers.dev/feed.ics?c=moon-phases%26lat%3D-33%26hemi%3Dsouth%26tz%3DAustralia%2FSydney',
      ),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    // Without recovery the swallowed lat/hemi never parse, and the negative latitude
    // would not be checked against the southern hemisphere at all.
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Full Moon');
  });

  it('does not 400 on a non-numeric latitude', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases&lat=not-a-number'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
  });

  it('sets an ETag on the feed', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it('returns 304 with an empty body when If-None-Match matches', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const url = 'https://space-calendar.workers.dev/feed.ics?c=moon-phases';

    const first = await worker.fetch(makeRequest(url), env, ctx);
    const etag = first.headers.get('ETag')!;

    const second = await worker.fetch(
      new Request(url, { headers: { 'If-None-Match': etag } }),
      env,
      ctx,
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('ETag')).toBe(etag);
  });

  it('accepts a weakened validator in If-None-Match', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const url = 'https://space-calendar.workers.dev/feed.ics?c=moon-phases';

    const first = await worker.fetch(makeRequest(url), env, ctx);
    const etag = first.headers.get('ETag')!;

    const second = await worker.fetch(
      new Request(url, { headers: { 'If-None-Match': `W/${etag}, "other"` } }),
      env,
      ctx,
    );
    expect(second.status).toBe(304);
  });

  it('serves the full body when If-None-Match does not match', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      new Request('https://space-calendar.workers.dev/feed.ics?c=moon-phases', {
        headers: { 'If-None-Match': '"stale"' },
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Full Moon');
  });

  it('returns cached response on cache hit without reading KV', async () => {
    const cachedResponse = new Response('CACHED_ICS', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    });
    (caches.default.match as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedResponse);

    const kv = makeKV({});
    const getSpy = vi.spyOn(kv, 'get');
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };

    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(await res.text()).toBe('CACHED_ICS');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('stores response in edge cache after computing', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const waitUntil = vi.fn();
    await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      { waitUntil } as unknown as ExecutionContext,
    );
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(caches.default.put).toHaveBeenCalledOnce();
  });
});

describe('JSON feed (/feed.json)', () => {
  it('returns 200 with application/json content type', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.json?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns events as JSON with name and events fields', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.json?c=moon-phases'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await res.json() as { name: string; events: CalendarEvent[] };
    expect(body.name).toBe('Moon Phases');
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.uid).toBe(moonEvent.uid);
    expect(body.events[0]!.title).toBe(moonEvent.title);
  });

  it('returns 400 when no categories are specified', async () => {
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.json'),
      makeEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when latitude and hemisphere contradict', async () => {
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.json?c=moon-phases&lat=-45&hemi=north'),
      makeEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(400);
  });

  it('merges and sorts events from multiple categories', async () => {
    const env = makeEnv({
      'static:moon-phases': JSON.stringify([moonEvent]),
      'static:eclipses-lunar': JSON.stringify([eclipseEvent]),
    });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.json?c=moon-phases,eclipses-lunar'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const body = await res.json() as { name: string; events: CalendarEvent[] };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]!.uid).toBe(moonEvent.uid);
    expect(body.events[1]!.uid).toBe(eclipseEvent.uid);
  });
});
