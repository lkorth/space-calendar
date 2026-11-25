import { describe, it, expect, vi } from 'vitest';
import worker from './index.ts';

function get(path: string, store: Record<string, string>) {
  const env = { CALENDAR_KV: { get: (k: string) => Promise.resolve(store[k] ?? null) } as unknown as KVNamespace };
  const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  return worker.fetch(new Request(`https://space-calendar.workers.dev${path}`), env, ctx);
}

describe('/wall-calendar.json', () => {
  it('serves the stored events to any origin', async () => {
    const res = await get('/wall-calendar.json', { 'static:wall-calendar-events': '[{"uid":"a"}]' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400');
    expect(await res.json()).toEqual({ events: [{ uid: 'a' }] });
  });

  it('answers 503, uncached, before the pipeline has written the events', async () => {
    const res = await get('/wall-calendar.json', {});
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not draw calendars in the worker', async () => {
    expect((await get('/wall-calendar.svg', {})).status).toBe(404);
  });
});
