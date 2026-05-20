import { fetchUpcomingLaunches } from '../clients/launch-library.ts';
import type { LL2Launch } from '../clients/launch-library.ts';
import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from '../types.ts';

const KV_KEY = 'launches';
const TTL_SECONDS = 60 * 60; // 1 hour

export const launchesCategory: Category = {
  slug: 'launches',

  async fetch(env: Env, _params: RequestParams): Promise<CategoryResult> {
    const cached = await env.CALENDAR_KV.get(KV_KEY);
    if (cached) return { events: JSON.parse(cached) as CalendarEvent[], cache: true };

    const launches = await fetchUpcomingLaunches(env.LL2_API_KEY);
    if (launches === null) return { events: [], cache: false };

    const events: CalendarEvent[] = launches.map((launch) => {
      const windowStart = new Date(launch.window_start);
      const windowEnd = launch.window_end
        ? new Date(launch.window_end)
        : new Date(windowStart.getTime() + 30 * 60 * 1000); // 30-min minimum

      const vehicle = launch.rocket.configuration.name;
      const mission = launch.mission?.name ?? launch.name;
      const webcast = launch.vidURLs?.[0]?.url;
      const infoUrl = launch.infoURLs?.[0]?.url;

      return {
        uid: `launch-${launch.id}@space-calendar`,
        title: `🚀 ${vehicle} | ${mission}`,
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        allDay: false,
        description: buildDescription(launch, webcast),
        url: infoUrl,
        category: 'launches',
      };
    });

    await env.CALENDAR_KV.put(KV_KEY, JSON.stringify(events), {
      expirationTtl: TTL_SECONDS,
    });
    return { events, cache: true };
  },
};

function buildDescription(launch: LL2Launch, webcast?: string): string {
  const parts: string[] = [];
  if (launch.mission?.description) {
    parts.push(launch.mission.description);
  }
  const details = [
    `Vehicle: ${launch.rocket.configuration.full_name}`,
    `Provider: ${launch.launch_service_provider.name}`,
    `Pad: ${launch.pad.name}, ${launch.pad.location.name}`,
  ];
  if (webcast) details.push(`Webcast: ${webcast}`);
  parts.push(details.join('\n'));
  return parts.join('\n\n');
}
