import { buildICS } from './ics.ts';
import { makeStaticCategory, makeSolsticesCategory } from './categories/static.ts';
import { launchesCategory } from './categories/launches.ts';
import { auroraCategory, auroraAustralisCategory } from './categories/aurora.ts';
import { milkyWayCategory } from './categories/milky-way.ts';
import { astronomyClubsCategory } from './categories/astronomy-clubs.ts';
import { missionMilestonesCategory } from './categories/mission-milestones.ts';
import { STATIC_CATEGORIES } from '../shared/models.ts';
import type { CalendarEvent, CategorySlug } from '../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from './types.ts';

const STATIC_CATEGORY_MAP: Map<CategorySlug, Category> = new Map([
  ...STATIC_CATEGORIES
    .filter((slug) => slug !== 'solstices-equinoxes')
    .map((slug) => [slug, makeStaticCategory(slug)] as [CategorySlug, Category]),
]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.redirect('https://space-calendar.pages.dev', 301);
    }

    if (url.pathname !== '/feed.ics' && url.pathname !== '/feed.json') {
      return new Response('Not found', { status: 404 });
    }

    const params = parseParams(url);
    if (params.categories.length === 0) {
      return new Response('Provide at least one category via ?c=', { status: 400 });
    }
    if (params.lat !== undefined && params.lat !== 0) {
      const latIsNorth = params.lat > 0;
      if (latIsNorth !== (params.hemisphere === 'northern')) {
        return new Response('Hemisphere and latitude do not match', { status: 400 });
      }
    }

    const cacheKey = buildCacheKey(request, env.DEPLOY_ID);
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;

    try {
      const { events, cache } = await fetchEvents(params, env);
      const calName = buildCalName(params.categories);

      let response: Response;
      if (url.pathname === '/feed.json') {
        response = new Response(JSON.stringify({ name: calName, events }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        const ics = buildICS(events, calName, params.tz);
        response = new Response(ics, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Content-Disposition': 'attachment; filename="space-calendar.ics"',
          },
        });
      }

      if (cache) {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
      }
      return response;
    } catch (err) {
      console.error('Feed error:', err);
      return new Response('Internal server error', { status: 500 });
    }
  },
};

async function fetchEvents(params: RequestParams, env: Env): Promise<CategoryResult> {
  // Build the category map per-request so hemisphere-aware categories get the right params
  const CATEGORIES: Map<CategorySlug, Category> = new Map([
    ...STATIC_CATEGORY_MAP,
    ['solstices-equinoxes', makeSolsticesCategory(params.hemisphere)],
    ['launches', launchesCategory],
    ['mission-milestones', missionMilestonesCategory],
    ['aurora', auroraCategory],
    ['aurora-australis', auroraAustralisCategory],
    ['milky-way', milkyWayCategory],
    ['astronomy-clubs', astronomyClubsCategory],
  ]);

  const results = await Promise.all(
    params.categories.map((slug) => {
      const category = CATEGORIES.get(slug);
      return category
        ? category.fetch(env, params)
        : Promise.resolve<CategoryResult>({ events: [], cache: true });
    }),
  );

  return {
    events: results.flatMap((r) => r.events).sort((a, b) => a.start.localeCompare(b.start)),
    cache: results.every((r) => r.cache),
  };
}

function buildCacheKey(request: Request, deployId?: string): Request {
  const url = new URL(request.url);
  if (deployId) url.searchParams.set('_v', deployId);
  return new Request(url.toString());
}

function parseParams(url: URL): RequestParams {
  const rawCategories = (url.searchParams.get('c') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as CategorySlug[];

  const rawLat = url.searchParams.get('lat');
  const lat = rawLat ? Math.round(parseFloat(rawLat)) : undefined;
  const tz = url.searchParams.get('tz') ?? undefined;

  const rawHemi = url.searchParams.get('hemi');
  const hemisphere = rawHemi === 'south' ? 'southern' : 'northern';

  const club = url.searchParams.get('club') ?? undefined;

  return { categories: rawCategories, lat, tz, hemisphere, club };
}

function buildCalName(categories: CategorySlug[]): string {
  if (categories.length > 2) return 'Space Calendar';
  const labels: Record<CategorySlug, string> = {
    'moon-phases': 'Moon Phases',
    'meteor-showers': 'Meteor Showers',
    'eclipses-solar': 'Solar Eclipses',
    'eclipses-lunar': 'Lunar Eclipses',
    'solstices-equinoxes': 'Solstices & Equinoxes',
    oppositions: 'Planetary Oppositions',
    elongations: 'Elongations',
    asteroids: 'Asteroid Flybys',
    comets: 'Comets',
    occultations: 'Lunar Occultations',
    conjunctions: 'Planetary Conjunctions',
    alignments: 'Planetary Alignments',
    launches: 'Rocket Launches',
    history: 'Space History',
    'mission-milestones': 'Mission Milestones',
    aurora: 'Aurora Borealis',
    'aurora-australis': 'Aurora Australis',
    'milky-way': 'Milky Way',
    'deep-sky': 'Deep Sky',
    'astronomy-clubs': 'Astronomy Club',
  };
  return categories.map((s) => labels[s] ?? s).join(', ');
}
