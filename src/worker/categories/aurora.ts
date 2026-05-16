import { fetchKpForecast, kpThresholdForLatitude } from '../clients/noaa.ts';
import type { CalendarEvent, Category, Env, RequestParams } from '../../shared/models.ts';

const TTL_SECONDS = 60 * 60 * 4; // 4 hours

export const auroraCategory: Category = {
  slug: 'aurora',

  async fetch(env: Env, params: RequestParams): Promise<CalendarEvent[]> {
    if (params.lat === undefined) return [];
    const lat = Math.round(params.lat);

    const kvKey = `aurora:${lat}`;
    const cached = await env.CALENDAR_KV.get(kvKey);
    if (cached) return JSON.parse(cached) as CalendarEvent[];

    const threshold = kpThresholdForLatitude(lat);
    const forecast = await fetchKpForecast();
    const events = buildAuroraEvents(forecast, lat, threshold);

    await env.CALENDAR_KV.put(kvKey, JSON.stringify(events), {
      expirationTtl: TTL_SECONDS,
    });
    return events;
  },
};

interface KpEntry { time_tag: string; kp: number }

function buildAuroraEvents(
  forecast: KpEntry[],
  lat: number,
  threshold: number,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Group consecutive hours where Kp meets the threshold into single events
  let windowStart: Date | null = null;
  let peakKp = 0;

  const flush = (windowEnd: Date) => {
    if (!windowStart) return;
    const severity = kpSeverity(peakKp);
    events.push({
      uid: `aurora-${lat}-${windowStart.toISOString()}@space-calendar`,
      title: `Aurora Borealis — ${severity} Storm Likely`,
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      allDay: false,
      description: buildDescription(lat, peakKp, threshold),
      url: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast',
      category: 'aurora',
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
  // Close any open window
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

function buildDescription(lat: number, peakKp: number, threshold: number): string {
  return [
    `NOAA's 3-day Kp forecast predicts geomagnetic activity reaching Kp ${peakKp} — at or above the Kp ${threshold} threshold needed for aurora visibility at latitude ${lat}°N. Look north from a dark location away from city lights.`,
    `Forecasts beyond 24 hours carry significant uncertainty. For real-time conditions on the night of the event, check the NOAA aurora forecast map at swpc.noaa.gov before heading out.`,
  ].join('\n\n');
}
