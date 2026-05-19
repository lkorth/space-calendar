import { fetchKpForecast, kpThresholdForLatitude } from '../clients/noaa.ts';
import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from '../types.ts';

const TTL_SECONDS = 60 * 60 * 4; // 4 hours

function makeAuroraCategory(hemisphere: 'northern' | 'southern'): Category {
  const slug = hemisphere === 'southern' ? 'aurora-australis' : 'aurora';
  const displayName = hemisphere === 'southern' ? 'Aurora Australis' : 'Aurora Borealis';
  const direction = hemisphere === 'southern' ? 'south' : 'north';

  return {
    slug: slug as Category['slug'],

    async fetch(env: Env, params: RequestParams): Promise<CategoryResult> {
      if (params.lat === undefined) return { events: [], cache: true };
      const lat = Math.round(params.lat);

      // For australis, the lat param will be a negative number (e.g. -45 for New Zealand).
      // kpThresholdForLatitude uses the absolute value so the thresholds mirror each other.
      const kvKey = `${slug}:${lat}`;
      const cached = await env.CALENDAR_KV.get(kvKey);
      if (cached) return { events: JSON.parse(cached) as CalendarEvent[], cache: true };

      const threshold = kpThresholdForLatitude(Math.abs(lat));
      const forecast = await fetchKpForecast();
      const events = buildAuroraEvents(forecast, lat, threshold, displayName, direction);

      await env.CALENDAR_KV.put(kvKey, JSON.stringify(events), {
        expirationTtl: TTL_SECONDS,
      });
      return { events, cache: true };
    },
  };
}

export const auroraCategory: Category = makeAuroraCategory('northern');
export const auroraAustralisCategory: Category = makeAuroraCategory('southern');

interface KpEntry { time_tag: string; kp: number }

function buildAuroraEvents(
  forecast: KpEntry[],
  lat: number,
  threshold: number,
  displayName: string,
  direction: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const absLat = Math.abs(lat);
  const slug = displayName === 'Aurora Australis' ? 'aurora-australis' : 'aurora';

  let windowStart: Date | null = null;
  let peakKp = 0;

  const flush = (windowEnd: Date) => {
    if (!windowStart) return;
    const severity = kpSeverity(peakKp);
    events.push({
      uid: `${slug}-${lat}-${windowStart.toISOString()}@space-calendar`,
      title: `🌌 ${displayName} — ${severity} Storm Likely`,
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      allDay: false,
      description: buildDescription(absLat, peakKp, threshold, displayName, direction),
      url: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast',
      category: slug as 'aurora' | 'aurora-australis',
    });
    windowStart = null;
    peakKp = 0;
  };

  for (const entry of forecast) {
    const t = new Date(entry.time_tag);
    if (entry.kp >= threshold) {
      if (!windowStart) windowStart = t;
      peakKp = Math.max(peakKp, entry.kp);
    } else if (windowStart) {
      flush(t);
    }
  }
  if (windowStart && forecast.length > 0) {
    const last = new Date(forecast[forecast.length - 1]!.time_tag);
    flush(last);
  }

  return events;
}

function kpSeverity(kp: number): string {
  if (kp >= 9) return 'Extreme';
  if (kp >= 8) return 'Severe';
  if (kp >= 7) return 'Strong';
  if (kp >= 5) return 'Moderate';
  return 'Minor';
}

function buildDescription(absLat: number, peakKp: number, threshold: number, displayName: string, direction: string): string {
  return [
    `NOAA's 3-day Kp forecast predicts geomagnetic activity reaching Kp ${peakKp} — at or above the Kp ${threshold} threshold needed for ${displayName} visibility at latitude ${absLat}°. Look ${direction} from a dark location away from city lights.`,
    `Forecasts beyond 24 hours carry significant uncertainty. For real-time conditions on the night of the event, check the NOAA aurora forecast map at swpc.noaa.gov before heading out.`,
  ].join('\n\n');
}
