import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index.ts';
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
