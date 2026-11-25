import type { Env } from './types.ts';

export const WALL_CALENDAR_PATH = '/wall-calendar.json';

/** The events a wall calendar is drawn from: this calendar year and the next. The stored JSON
 *  is passed through unparsed, so a request costs next to no CPU time.
 *
 *  Not recorded as usage: those rows count feed subscriptions. */
export async function serveWallCalendarEvents(env: Env): Promise<Response> {
  const events = await env.CALENDAR_KV.get('static:wall-calendar-events', { cacheTtl: 3600 });
  if (!events) {
    return new Response('Wall calendar data is not available yet', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    });
  }
  return new Response(`{"events":${events}}`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
