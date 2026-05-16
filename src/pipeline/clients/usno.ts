const BASE = 'https://aa.usno.navy.mil/api';

export interface MoonPhase {
  phaseday: number;
  phase: string;
  time: string;
  month: number;
  year: number;
}

export interface MoonPhasesResponse {
  phasedata: MoonPhase[];
}

export interface EclipseEvent {
  event: string;
  year: number;
  month: number;
  day: number;
  time: string;
  /** Visibility region description */
  region?: string;
}

export interface EclipsesResponse {
  eclipses_in_year: EclipseEvent[];
}

export interface Season {
  month: number;
  day: number;
  time: string;
  phenom: string;
}

export interface SeasonsResponse {
  data: Season[];
}

export interface PlanetaryEvent {
  year: number;
  month: number;
  day: number;
  time: string;
  phenom: string;
  body: string;
}

export interface PlanetaryResponse {
  data: PlanetaryEvent[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`USNO API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const usno = {
  moonPhases: (year: number) =>
    get<MoonPhasesResponse>(`/moon/phases/year?year=${year}&nump=99`),

  solarEclipses: (year: number) =>
    get<EclipsesResponse>(`/eclipses/solar/year?year=${year}`),

  lunarEclipses: (year: number) =>
    get<EclipsesResponse>(`/eclipses/lunar/year?year=${year}`),

  seasons: (year: number) =>
    get<SeasonsResponse>(`/seasons?year=${year}`),

  /** Returns oppositions, elongations, and other planetary phenomena */
  planetaryPhenomena: (year: number) =>
    get<PlanetaryResponse>(`/planets/phenomena?year=${year}`),
};
