const FORECAST_URL =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

export interface KpForecastEntry {
  /** UTC time string */
  time_tag: string;
  kp: number;
  observed: 'observed' | 'estimated' | 'predicted';
  noaa_scale: string | null;
}

export async function fetchKpForecast(): Promise<KpForecastEntry[]> {
  const res = await fetch(FORECAST_URL);
  if (!res.ok) throw new Error(`NOAA SWPC error ${res.status}`);
  const raw = (await res.json()) as Array<{
    time_tag: string;
    kp: number;
    observed: string;
    noaa_scale: string | null;
  }>;
  return raw.map((entry) => ({
    time_tag: entry.time_tag,
    kp: entry.kp,
    observed: (entry.observed ?? 'predicted') as KpForecastEntry['observed'],
    noaa_scale: entry.noaa_scale,
  }));
}

/** Minimum Kp needed for aurora to be visible at a given whole-degree latitude */
export function kpThresholdForLatitude(lat: number): number {
  if (lat >= 65) return 1;
  if (lat >= 55) return 3;
  if (lat >= 50) return 5;
  if (lat >= 45) return 6;
  if (lat >= 40) return 7;
  if (lat >= 35) return 8;
  return 9;
}
