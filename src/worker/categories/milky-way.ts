import { MIN_DARK_HOURS, coreMaxAlt, milkyWayWindowForNight, minCoreAltDeg } from '../../shared/milky-way.ts';
import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from '../types.ts';
import { liveKvKey } from '../cache.ts';

const KV_TTL = 60 * 60 * 24; // 24h — refreshes naturally when pipeline regenerates

function offsetHoursAt(tz: string, ref: Date): number {
  const local = new Date(ref.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(ref.toLocaleString('en-US', { timeZone: 'UTC' }));
  return (local.getTime() - utc.getTime()) / 3600000;
}

/** Estimate an observer's *standard* (non-DST) UTC offset from an IANA timezone name.
 *  Used to approximate longitude (lon = offset * 15), which is a property of geography,
 *  not of the clock — so the DST-shifted offset must not be used here, or every
 *  DST-observing zone would compute a longitude ~15° too far east while DST is active.
 *  DST always adds to the standard offset (never subtracts), so the standard offset is
 *  the smaller of a January and a July reading, for either hemisphere. */
export function tzOffsetHours(tz: string | undefined): number {
  if (!tz) return 0;
  try {
    const jan = offsetHoursAt(tz, new Date(Date.UTC(2026, 0, 15, 0, 0, 0)));
    const jul = offsetHoursAt(tz, new Date(Date.UTC(2026, 6, 15, 0, 0, 0)));
    return Math.min(jan, jul);
  } catch {
    return 0;
  }
}

/** UTC midnights for every night in the rolling window: 6 months back through 1 year
 *  ahead, the same window the pipeline uses for static categories. A calendar-year window
 *  would leave northern subscribers with nothing upcoming from mid-August (when the core
 *  season ends) until January, and southern subscribers without their December–February
 *  nights at year end. */
export function nightsInWindow(now: Date): Date[] {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate()));
  const last = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
  const nights: Date[] = [];
  for (let d = first; d <= last; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    nights.push(d);
  }
  return nights;
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export const milkyWayCategory: Category = {
  slug: 'milky-way',

  async fetch(env: Env, params: RequestParams): Promise<CategoryResult> {
    const { lat, tz } = params;
    if (lat === undefined) return { events: [], cache: true };
    if (coreMaxAlt(lat) < minCoreAltDeg(lat)) return { events: [], cache: true };

    // Subscriptions generated before the configurator sent lon only carry tz, and those
    // URLs cannot be updated, so the timezone estimate stays as the fallback.
    const lon = params.lon ?? tzOffsetHours(tz) * 15;

    const kvKey = liveKvKey(env, `milky-way:${lat}:${lon}`);
    const cached = await env.CALENDAR_KV.get(kvKey);
    if (cached) return { events: JSON.parse(cached) as CalendarEvent[], cache: true };

    const events: CalendarEvent[] = [];
    for (const d of nightsInWindow(new Date())) {
      const window = milkyWayWindowForNight(d, lat, lon);
      if (!window || window.hours < MIN_DARK_HOURS) continue;

      const eventStart = new Date(d.getTime() + window.startHour * 3600000);
      const eventEnd = new Date(d.getTime() + window.endHour * 3600000);

      events.push({
        uid: `milky-way-${d.toISOString().slice(0, 10)}@space-calendar`,
        title: `🌌 Milky Way Viewing`,
        start: eventStart.toISOString(),
        end: eventEnd.toISOString(),
        allDay: false,
        description: buildDescription(lat, coreMaxAlt(lat), window.hours),
        url: 'https://www.lightpollutionmap.info/',
        category: 'milky-way',
      });
    }

    await env.CALENDAR_KV.put(kvKey, JSON.stringify(events), { expirationTtl: KV_TTL });
    return { events, cache: true };
  },
};

function buildDescription(lat: number, maxAlt: number, hours: number): string {
  const hemi = lat >= 0 ? 'south' : 'north';
  const latStr = `${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`;
  return [
    `Tonight the galactic core reaches up to ${Math.round(maxAlt)}° above the horizon from your latitude (${latStr}), with approximately ${Math.round(hours * 10) / 10} hours where it is visible during astronomical darkness with the moon below the horizon.`,
    `Look ${hemi} after astronomical twilight ends and allow 20–30 minutes for your eyes to dark-adapt.`,
    `A dark site well away from city lights is essential. Check light pollution levels at lightpollutionmap.info before heading out.`,
  ].join('\n\n');
}
