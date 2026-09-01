import { buildICS } from './ics.ts';
import { makeStaticCategory, makeSolsticesCategory } from './categories/static.ts';
import { launchesCategory } from './categories/launches.ts';
import { auroraCategory, auroraAustralisCategory } from './categories/aurora.ts';
import { milkyWayCategory } from './categories/milky-way.ts';
import { astronomyClubsCategory } from './categories/astronomy-clubs.ts';
import { missionMilestonesCategory } from './categories/mission-milestones.ts';
import { isFixedOffsetTimezone, parseParams } from './params.ts';
import { STATIC_CATEGORIES } from '../shared/models.ts';
import type { CalendarEvent, CategorySlug } from '../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from './types.ts';

export const SITE_URL = 'https://lkorth.github.io/space-calendar/';

const STATIC_CATEGORY_MAP: Map<CategorySlug, Category> = new Map([
  ...STATIC_CATEGORIES
    .filter((slug) => slug !== 'solstices-equinoxes')
    .map((slug) => [slug, makeStaticCategory(slug)] as [CategorySlug, Category]),
]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      // The configurator is published to GitHub Pages by .github/workflows/deploy-site.yml.
      // This is the domain baked into every subscription URL, so it is the one subscribers
      // see and share — it must land somewhere real.
      return Response.redirect(SITE_URL, 301);
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

    if (isFixedOffsetTimezone(params.tz)) {
      // Carries no DST rules, so contact times drift by an hour for half the year if the
      // subscriber's region observes DST. Logged rather than corrected because the real
      // zone cannot be recovered from an offset — see isFixedOffsetTimezone.
      console.warn('Fixed-offset timezone requested:', params.tz);
    }

    const cacheKey = buildCacheKey(request, env.DEPLOY_ID);
    const cached = await caches.default.match(cacheKey);
    if (cached) return notModifiedIfMatched(request, cached);

    try {
      const { events, cache } = await fetchEvents(params, env);
      const calName = buildCalName(params.categories);

      let response: Response;
      if (url.pathname === '/feed.json') {
        const json = JSON.stringify({ name: calName, events });
        response = new Response(json, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            ETag: await etagFor(json),
          },
        });
      } else {
        const ics = buildICS(events, calName, params.tz);
        response = new Response(ics, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Content-Disposition': 'attachment; filename="space-calendar.ics"',
            ETag: await etagFor(ics),
          },
        });
      }

      if (cache) {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
      }
      return notModifiedIfMatched(request, response);
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

/** Strong validator over the response body. Feeds are polled far more often than they
 *  change — some clients ignore max-age entirely and refetch every few minutes — so an
 *  ETag lets those requests settle for an empty 304 instead of the whole calendar. */
async function etagFor(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `"${hex}"`;
}

function notModifiedIfMatched(request: Request, response: Response): Response {
  const etag = response.headers.get('ETag');
  if (!etag) return response;

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (!ifNoneMatch) return response;
  // A client may send several validators, and a cache may have weakened ours in transit.
  const matched = ifNoneMatch
    .split(',')
    .map((v) => v.trim().replace(/^W\//, ''))
    .some((v) => v === etag || v === '*');
  if (!matched) return response;

  const headers = new Headers(response.headers);
  headers.delete('Content-Disposition');
  return new Response(null, { status: 304, headers });
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
