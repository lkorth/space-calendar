const CAD_BASE = 'https://ssd-api.jpl.nasa.gov/cad.api';
const SBDB_BASE = 'https://ssd-api.jpl.nasa.gov/sbdb.api';

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
): Promise<ParsedCloseApproach[]> {
  const dateMin = `${year}-01-01`;
  const dateMax = `${year}-12-31`;
  // Filter: dist < 0.05 au (~19.5 LD), H < 22 (roughly > 140m diameter)
  const url = `${CAD_BASE}?date-min=${dateMin}&date-max=${dateMax}&dist-max=0.05&h-max=22&sort=date`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JPL CAD API error ${res.status}`);
  const raw = (await res.json()) as CloseApproachResponse;

  const fields = raw.fields;
  const idx = (name: string) => fields.indexOf(name);

  return raw.data.map((row) => ({
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JPL SBDB API error ${res.status}: ${designation}`);
  return res.json() as Promise<SBDBObject>;
}
