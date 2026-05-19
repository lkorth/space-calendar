import type { CalendarEvent, CategorySlug } from '../shared/models.ts';

export type Hemisphere = 'northern' | 'southern';

export interface RequestParams {
  categories: CategorySlug[];
  /** Whole-number latitude for aurora visibility, e.g. 45 */
  lat?: number;
  /** IANA timezone for formatting contact times, e.g. "America/Denver" */
  tz?: string;
  /** Hemisphere for season labeling and aurora selection. Defaults to northern. */
  hemisphere?: Hemisphere;
  /** Astronomy club ID for the astronomy-clubs category, e.g. "jgap" */
  club?: string;
}

export interface Env {
  CALENDAR_KV: KVNamespace;
  /** Optional API key for Launch Library 2 higher rate limits */
  LL2_API_KEY?: string;
  /** Git SHA injected at deploy time — changing it busts the edge cache */
  DEPLOY_ID?: string;
}

export interface CategoryResult {
  events: CalendarEvent[];
  /** Whether this result may be stored in the edge cache. Set to false when data
   *  may be empty due to a transient error (e.g. API rate limiting) rather than
   *  a genuinely empty result, so a poisoned empty response is never cached. */
  cache: boolean;
}

export interface Category {
  readonly slug: CategorySlug;
  fetch(env: Env, params: RequestParams): Promise<CategoryResult>;
}

export interface WorkerClient<TResponse> {
  fetch(params?: Record<string, string>): Promise<TResponse>;
}
