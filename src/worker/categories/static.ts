/**
 * Generic category handler for all statically-generated categories.
 * Reads pre-generated JSON from KV and returns the events as-is.
 */
import type { CalendarEvent, Category, CategorySlug, Env, RequestParams } from '../../shared/models.ts';

export function makeStaticCategory(slug: CategorySlug): Category {
  return {
    slug,
    async fetch(env: Env, _params: RequestParams): Promise<CalendarEvent[]> {
      const json = await env.CALENDAR_KV.get(`static:${slug}`);
      if (!json) return [];
      return JSON.parse(json) as CalendarEvent[];
    },
  };
}
