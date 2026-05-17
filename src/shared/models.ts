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
  | 'occultations'
  | 'conjunctions'
  | 'alignments'
  | 'launches'
  | 'history'
  | 'aurora'
  | 'aurora-australis'
  | 'milky-way'
  | 'deep-sky'
  | 'astronomy-clubs';

export type Schedule = 'monthly' | 'weekly' | 'on-change';

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
  'occultations',
  'conjunctions',
  'alignments',
  'history',
  'deep-sky',
];

/** Categories fetched live by the worker on each request */
export const LIVE_CATEGORIES: CategorySlug[] = ['launches', 'aurora', 'aurora-australis', 'milky-way', 'astronomy-clubs'];

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

