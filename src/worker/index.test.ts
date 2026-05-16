import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index.ts';
import type { CalendarEvent } from '../shared/models.ts';

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
    const res = await worker.fetch(makeRequest('https://space-calendar.workers.dev/unknown'), makeEnv(), {} as ExecutionContext);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no categories are specified', async () => {
    const res = await worker.fetch(makeRequest('https://space-calendar.workers.dev/feed.ics'), makeEnv(), {} as ExecutionContext);
    expect(res.status).toBe(400);
  });

  it('returns 200 with text/calendar content type for valid request', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      {} as ExecutionContext,
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
      {} as ExecutionContext,
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
      {} as ExecutionContext,
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
      {} as ExecutionContext,
    );
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
  });

  it('ignores unknown category slugs gracefully', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases,not-a-real-category'),
      env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
  });

  it('sets Cache-Control header', async () => {
    const env = makeEnv({ 'static:moon-phases': JSON.stringify([moonEvent]) });
    const res = await worker.fetch(
      makeRequest('https://space-calendar.workers.dev/feed.ics?c=moon-phases'),
      env,
      {} as ExecutionContext,
    );
    expect(res.headers.get('Cache-Control')).toBeTruthy();
  });
});
