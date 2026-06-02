const CAD_BASE = 'https://ssd-api.jpl.nasa.gov/cad.api';
const SBDB_BASE = 'https://ssd-api.jpl.nasa.gov/sbdb.api';
const HORIZONS_BASE = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    const res = await fetch(url);
    if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) return res;
    console.warn(`JPL API ${res.status} on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${Math.pow(2, attempt)}s…`);
  }
  throw new Error('unreachable');
}

// ---------------------------------------------------------------------------
// JPL Horizons — planetary elongation ephemeris
// Used to find oppositions (outer planets) and greatest elongations (inner)
// ---------------------------------------------------------------------------

export interface EphemerisEntry {
  /** ISO 8601 date string */
  date: string;
  /** Sun-Observer-Target elongation in degrees */
  elongation: number;
  /** T = trailing (east of Sun, evening), L = leading (west of Sun, morning) */
  direction: 'T' | 'L';
}

async function fetchElongation(
  bodyId: string,
  year: number,
): Promise<EphemerisEntry[]> {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: bodyId,
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',
    START_TIME: `${year}-Jan-01`,
    STOP_TIME: `${year}-Dec-31`,
    STEP_SIZE: '1d',
    QUANTITIES: '23',
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
  });

  const res = await fetchWithRetry(`${HORIZONS_BASE}?${params}`);
  if (!res.ok) throw new Error(`JPL Horizons error ${res.status} for body ${bodyId}`);
  const json = (await res.json()) as { result: string };

  const lines = json.result.split('\n');
  const soe = lines.findIndex((l) => l.includes('$$SOE'));
  const eoe = lines.findIndex((l) => l.includes('$$EOE'));
  if (soe === -1 || eoe === -1) throw new Error(`No ephemeris data for body ${bodyId}`);

  const entries: EphemerisEntry[] = [];
  for (const line of lines.slice(soe + 1, eoe)) {
    // Format: " 2026-Jan-10 00:00     179.5072 /L"
    const match = line.match(/(\d{4}-\w{3}-\d{2})\s+\d{2}:\d{2}\s+([\d.]+)\s+\/([TL])/);
    if (!match) continue;
    const [, rawDate, elong, dir] = match;
    // Convert "2026-Jan-10" to "2026-01-10"
    const date = rawDate!.replace(
      /(\d{4})-(\w{3})-(\d{2})/,
      (_, y, m, d) => `${y}-${String(MONTH_NUM[m] ?? 1).padStart(2, '0')}-${d}`,
    );
    entries.push({ date, elongation: parseFloat(elong!), direction: dir as 'T' | 'L' });
  }
  return entries;
}

const MONTH_NUM: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// ---------------------------------------------------------------------------
// Moon geocentric distance — used for supermoon detection
// ---------------------------------------------------------------------------

const AU_TO_KM = 149_597_870.7;

/** Geocentric distance of the Moon in km, keyed by ISO date string (YYYY-MM-DD) */
export async function fetchMoonDistances(year: number): Promise<Record<string, number>> {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: '301',          // Moon
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',       // geocentric Earth
    START_TIME: `${year}-Jan-01`,
    STOP_TIME: `${year}-Dec-31`,
    STEP_SIZE: '1d',
    QUANTITIES: '20',        // observer range & range-rate (AU)
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
  });

  const res = await fetchWithRetry(`${HORIZONS_BASE}?${params}`);
  if (!res.ok) throw new Error(`JPL Horizons error ${res.status} fetching Moon distances`);
  const json = (await res.json()) as { result: string };

  const lines = json.result.split('\n');
  const soe = lines.findIndex((l) => l.includes('$$SOE'));
  const eoe = lines.findIndex((l) => l.includes('$$EOE'));
  if (soe === -1 || eoe === -1) throw new Error('No Moon distance data in Horizons response');

  const distances: Record<string, number> = {};
  for (const line of lines.slice(soe + 1, eoe)) {
    // Format: " 2026-Jan-03 00:00      0.00238532  ..."
    const match = line.match(/(\d{4}-\w{3}-\d{2})\s+\d{2}:\d{2}\s+([\d.]+)/);
    if (!match) continue;
    const [, rawDate, distAU] = match;
    const date = rawDate!.replace(
      /(\d{4})-(\w{3})-(\d{2})/,
      (_, y, m, d) => `${y}-${String(MONTH_NUM[m] ?? 1).padStart(2, '0')}-${d}`,
    );
    distances[date] = parseFloat(distAU!) * AU_TO_KM;
  }
  return distances;
}

export interface PlanetaryEvent {
  name: string;
  date: string;
  type: 'opposition' | 'greatest-elongation-east' | 'greatest-elongation-west';
  elongation: number;
}

const OUTER_PLANETS = [
  { id: '499', name: 'Mars' },
  { id: '599', name: 'Jupiter' },
  { id: '699', name: 'Saturn' },
  { id: '799', name: 'Uranus' },
  { id: '899', name: 'Neptune' },
];

const INNER_PLANETS = [
  { id: '199', name: 'Mercury', minElongation: 18 },
  { id: '299', name: 'Venus', minElongation: 40 },
];

/** Find opposition dates from a daily elongation series (outer planets) */
export function findOppositions(entries: EphemerisEntry[]): EphemerisEntry[] {
  const results: EphemerisEntry[] = [];
  for (let i = 1; i < entries.length - 1; i++) {
    const prev = entries[i - 1]!;
    const curr = entries[i]!;
    const next = entries[i + 1]!;
    if (curr.elongation > prev.elongation && curr.elongation > next.elongation && curr.elongation > 170) {
      results.push(curr);
    }
  }
  return results;
}

/** Find greatest elongation dates from a daily elongation series (inner planets) */
export function findGreatestElongations(entries: EphemerisEntry[], minElongation: number): EphemerisEntry[] {
  const results: EphemerisEntry[] = [];
  for (let i = 1; i < entries.length - 1; i++) {
    const prev = entries[i - 1]!;
    const curr = entries[i]!;
    const next = entries[i + 1]!;
    if (curr.elongation > prev.elongation && curr.elongation > next.elongation && curr.elongation >= minElongation) {
      results.push(curr);
    }
  }
  return results;
}

export async function fetchPlanetaryEvents(year: number): Promise<PlanetaryEvent[]> {
  const events: PlanetaryEvent[] = [];

  for (const planet of OUTER_PLANETS) {
    const entries = await fetchElongation(planet.id, year);
    for (const entry of findOppositions(entries)) {
      events.push({ name: planet.name, date: entry.date, type: 'opposition', elongation: entry.elongation });
    }
  }

  for (const planet of INNER_PLANETS) {
    const entries = await fetchElongation(planet.id, year);
    for (const entry of findGreatestElongations(entries, planet.minElongation)) {
      events.push({
        name: planet.name,
        date: entry.date,
        type: entry.direction === 'T' ? 'greatest-elongation-east' : 'greatest-elongation-west',
        elongation: entry.elongation,
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Close Approach Data (asteroids)
// ---------------------------------------------------------------------------

export interface CloseApproach {
  /** Object designation */
  des: string;
  /** Calendar date of close approach (UTC) */
  cd: string;
  /** Nominal approach distance (au) */
  dist: string;
  /** Minimum approach distance (au) */
  dist_min: string;
  /** Relative velocity at approach (km/s) */
  v_rel: string;
  /** Absolute magnitude (proxy for size) */
  h: string;
  /** Object diameter estimate in km (if available) */
  diameter?: string;
}

export interface CloseApproachResponse {
  signature: { source: string; version: string };
  count: string;
  fields: string[];
  data: string[][];
}

export interface ParsedCloseApproach {
  des: string;
  cd: string;
  dist_au: number;
  dist_ld: number;
  v_rel_kms: number;
  h: number;
}

export async function fetchCloseApproaches(
  year: number,
  options: { distMaxAu?: number; hMax?: number } = { distMaxAu: 0.05, hMax: 22 },
): Promise<ParsedCloseApproach[]> {
  const { distMaxAu = 0.05, hMax } = options;
  const dateMin = `${year}-01-01`;
  const dateMax = `${year}-12-31`;
  let url = `${CAD_BASE}?date-min=${dateMin}&date-max=${dateMax}&dist-max=${distMaxAu}&sort=date`;
  if (hMax !== undefined) url += `&h-max=${hMax}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`JPL CAD API error ${res.status}`);
  const raw = (await res.json()) as CloseApproachResponse;

  const fields = raw.fields;
  const idx = (name: string) => fields.indexOf(name);

  return (raw.data ?? []).map((row) => ({
    des: row[idx('des')] ?? '',
    cd: row[idx('cd')] ?? '',
    dist_au: parseFloat(row[idx('dist')] ?? '0'),
    dist_ld: parseFloat(row[idx('dist')] ?? '0') * 389.17,
    v_rel_kms: parseFloat(row[idx('v_rel')] ?? '0'),
    h: parseFloat(row[idx('h')] ?? '0'),
  }));
}

// ---------------------------------------------------------------------------
// Small-Body Database (comets)
// ---------------------------------------------------------------------------

export interface SBDBObject {
  object: {
    des: string;
    fullname: string;
    orbit_class: { name: string };
  };
  orbit: {
    elements: Array<{ name: string; value: string }>;
    /** Perihelion time as Julian date string */
    tp?: string;
  };
  phys_par?: Array<{ name: string; value: string; desc: string }>;
}

export async function fetchComet(designation: string): Promise<SBDBObject> {
  const url = `${SBDB_BASE}?sstr=${encodeURIComponent(designation)}&phys-par=1&full-prec=1`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`JPL SBDB API error ${res.status}: ${designation}`);
  return res.json() as Promise<SBDBObject>;
}
