import type { CalendarEvent, CategorySlug } from '../../shared/models.ts';
import type { Category, Env, Hemisphere, RequestParams } from '../types.ts';

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

// ---------------------------------------------------------------------------
// Hemisphere-aware solstices/equinoxes
// The static data is generated with Northern Hemisphere labels.
// When hemisphere=southern, we rewrite titles and descriptions at serve time.
// ---------------------------------------------------------------------------

const SH_TITLE_MAP: Record<string, string> = {
  '🌸 March Equinox — Vernal Equinox (Northern Hemisphere)': '🍂 March Equinox — Autumnal Equinox (Southern Hemisphere)',
  '☀️ June Solstice — Summer Solstice (Northern Hemisphere)': '❄️ June Solstice — Winter Solstice (Southern Hemisphere)',
  '🍂 September Equinox — Autumnal Equinox (Northern Hemisphere)': '🌸 September Equinox — Vernal Equinox (Southern Hemisphere)',
  '❄️ December Solstice — Winter Solstice (Northern Hemisphere)': '☀️ December Solstice — Summer Solstice (Southern Hemisphere)',
};

// Full-sentence swaps for SH descriptions. Each pair is unique in the description corpus,
// so replacements are applied sequentially without risk of chaining conflicts.
const SH_DESC_SWAPS: [RegExp, string][] = [
  // March Equinox
  [
    /In the Northern Hemisphere this marks the astronomical start of spring; in the Southern Hemisphere, the start of autumn/g,
    'In the Southern Hemisphere this marks the astronomical start of autumn; in the Northern Hemisphere, the start of spring',
  ],
  // September Equinox
  [
    /In the Northern Hemisphere this marks the astronomical start of autumn; in the Southern Hemisphere, the start of spring/g,
    'In the Southern Hemisphere this marks the astronomical start of spring; in the Northern Hemisphere, the start of autumn',
  ],
  // June Solstice — day length
  [
    /the longest day of the year in the Northern Hemisphere and the shortest in the Southern/g,
    'the shortest day of the year in the Southern Hemisphere and the longest in the Northern',
  ],
  // June Solstice — tilt sentence
  [
    /today that tilt points the Northern Hemisphere most directly toward the Sun/g,
    'today that tilt points the Southern Hemisphere least directly toward the Sun',
  ],
  // December Solstice — day length
  [
    /the shortest day of the year in the Northern Hemisphere and the longest in the Southern/g,
    'the longest day of the year in the Southern Hemisphere and the shortest in the Northern',
  ],
  // December Solstice — lengthening days
  [
    /After today, days begin lengthening again in the Northern Hemisphere/g,
    'After today, days begin shortening again in the Southern Hemisphere',
  ],
];

/** Rewrite season titles and descriptions for Southern Hemisphere subscribers */
export function applyHemisphere(event: CalendarEvent, hemisphere: Hemisphere): CalendarEvent {
  if (hemisphere !== 'southern') return event;
  const newTitle = SH_TITLE_MAP[event.title];
  if (!newTitle) return event;
  let desc = event.description;
  for (const [pattern, replacement] of SH_DESC_SWAPS) {
    desc = desc.replace(pattern, replacement);
  }
  return { ...event, title: newTitle, description: desc };
}

export function makeSolsticesCategory(hemisphere?: Hemisphere): Category {
  return {
    slug: 'solstices-equinoxes',
    async fetch(env: Env, _params: RequestParams): Promise<CalendarEvent[]> {
      const json = await env.CALENDAR_KV.get('static:solstices-equinoxes');
      if (!json) return [];
      const events = JSON.parse(json) as CalendarEvent[];
      if (!hemisphere || hemisphere === 'northern') return events;
      return events.map((e) => applyHemisphere(e, hemisphere));
    },
  };
}
