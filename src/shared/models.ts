export interface ContactTime {
  label: string;
  /** ISO 8601 UTC string */
  utc: string;
}

export interface PathLocation {
  city: string;
  country: string;
  /** ISO 8601 UTC — moment of central eclipse */
  centralUTC: string;
  /** ISO 8601 UTC — start of totality/annularity */
  c2UTC: string;
  /** ISO 8601 UTC — end of totality/annularity */
  c3UTC: string;
  durationSec: number;
}

export interface CalendarEvent {
  uid: string;
  title: string;
  /** ISO 8601 UTC string */
  start: string;
  /** ISO 8601 UTC string */
  end: string;
  allDay: boolean;
  description: string;
  /** Ordered phase contact times, formatted into the subscriber's timezone at request time */
  contactTimes?: ContactTime[];
  /** Cities in the path of totality/annularity, formatted into the subscriber's timezone at request time */
  pathLocations?: PathLocation[];
  url?: string;
  category: CategorySlug;
}

export type CategorySlug =
  | 'moon-phases'
  | 'meteor-showers'
  | 'eclipses-solar'
  | 'eclipses-lunar'
  | 'solstices-equinoxes'
  | 'oppositions'
  | 'elongations'
  | 'asteroids'
  | 'comets'
  | 'launches'
  | 'history'
  | 'aurora';

export type Schedule = 'annual' | 'monthly' | 'weekly' | 'on-change';

/** Categories whose events are pre-generated and stored in KV */
export const STATIC_CATEGORIES: CategorySlug[] = [
  'moon-phases',
  'meteor-showers',
  'eclipses-solar',
  'eclipses-lunar',
  'solstices-equinoxes',
  'oppositions',
  'elongations',
  'asteroids',
  'comets',
  'history',
];

/** Categories fetched live by the worker on each request */
export const LIVE_CATEGORIES: CategorySlug[] = ['launches', 'aurora'];

// ---------------------------------------------------------------------------
// Pipeline interfaces
// ---------------------------------------------------------------------------

/** A typed client for a single external API */
export interface PipelineClient<TResponse> {
  fetch(year: number): Promise<TResponse>;
}

/** A generator transforms raw API data into CalendarEvents for one category */
export interface Generator {
  readonly slug: CategorySlug;
  readonly schedule: Schedule;
  generate(year: number): Promise<CalendarEvent[]>;
}

// ---------------------------------------------------------------------------
// Worker interfaces
// ---------------------------------------------------------------------------

export interface Env {
  CALENDAR_KV: KVNamespace;
  /** Optional API key for Launch Library 2 higher rate limits */
  LL2_API_KEY?: string;
}

export interface RequestParams {
  categories: CategorySlug[];
  /** Whole-number latitude for aurora visibility, e.g. 45 */
  lat?: number;
  /** IANA timezone for formatting contact times, e.g. "America/Denver" */
  tz?: string;
}

/** A worker category knows how to produce CalendarEvents, from KV or live */
export interface Category {
  readonly slug: CategorySlug;
  fetch(env: Env, params: RequestParams): Promise<CalendarEvent[]>;
}

/** A typed client for a live data source used by the worker */
export interface WorkerClient<TResponse> {
  fetch(params?: Record<string, string>): Promise<TResponse>;
}
