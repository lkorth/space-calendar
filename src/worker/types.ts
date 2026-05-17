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
}

export interface Env {
  CALENDAR_KV: KVNamespace;
  /** Optional API key for Launch Library 2 higher rate limits */
  LL2_API_KEY?: string;
}

export interface Category {
  readonly slug: CategorySlug;
  fetch(env: Env, params: RequestParams): Promise<CalendarEvent[]>;
}

export interface WorkerClient<TResponse> {
  fetch(params?: Record<string, string>): Promise<TResponse>;
}
