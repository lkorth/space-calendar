import { fetchUpcomingEvents } from '../clients/ll2-events.ts';
import type { LL2Event } from '../clients/ll2-events.ts';
import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from '../types.ts';

const KV_KEY = 'mission-milestones';
const TTL_SECONDS = 60 * 60; // 1 hour

export const missionMilestonesCategory: Category = {
  slug: 'mission-milestones',

  async fetch(env: Env, _params: RequestParams): Promise<CategoryResult> {
    const cached = await env.CALENDAR_KV.get(KV_KEY);
    if (cached) return { events: JSON.parse(cached) as CalendarEvent[], cache: true };

    const ll2Events = await fetchUpcomingEvents(env.LL2_API_KEY);
    if (ll2Events === null) return { events: [], cache: false };

    const events = ll2Events.map(toCalendarEvent);
    await env.CALENDAR_KV.put(KV_KEY, JSON.stringify(events), {
      expirationTtl: TTL_SECONDS,
    });
    return { events, cache: true };
  },
};

export function toCalendarEvent(event: LL2Event): CalendarEvent {
  const dateStr = event.date.slice(0, 10);
  const end = new Date(dateStr + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    uid: `mission-milestone-${event.id}@space-calendar`,
    title: `🛸 ${event.name}`,
    start: dateStr,
    end: end.toISOString().slice(0, 10),
    allDay: true,
    description: buildDescription(event),
    url: event.news_url ?? undefined,
    category: 'mission-milestones',
  };
}

function buildDescription(event: LL2Event): string {
  const parts: string[] = [];
  if (event.description) parts.push(event.description);
  if (event.location) parts.push(`Location: ${event.location}`);
  return parts.join('\n\n');
}
