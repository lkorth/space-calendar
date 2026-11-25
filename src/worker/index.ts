import { buildICS } from './ics.ts';
import { makeStaticCategory, makeSolsticesCategory } from './categories/static.ts';
import { launchesCategory } from './categories/launches.ts';
import { auroraCategory, auroraAustralisCategory } from './categories/aurora.ts';
import { milkyWayCategory } from './categories/milky-way.ts';
import { astronomyClubsCategory } from './categories/astronomy-clubs.ts';
import { missionMilestonesCategory } from './categories/mission-milestones.ts';
import { isFixedOffsetTimezone, parseParams } from './params.ts';
import { recordUsage } from './usage.ts';
import { LIVE_CATEGORIES, RETIRED_CATEGORIES, STATIC_CATEGORIES } from '../shared/models.ts';
import type { CalendarEvent, CategorySlug } from '../shared/models.ts';
import type { Category, CategoryResult, Env, RequestParams } from './types.ts';

const STATIC_CATEGORY_MAP: Map<CategorySlug, Category> = new Map([
  ...STATIC_CATEGORIES
    .filter((slug) => slug !== 'solstices-equinoxes')
    .map((slug) => [slug, makeStaticCategory(slug)] as [CategorySlug, Category]),
]);

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set([...STATIC_CATEGORIES, ...LIVE_CATEGORIES]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // The configurator and its assets are served by the [assets] binding in wrangler.toml,
    // which is matched before the Worker runs. Anything reaching here matched no asset.
    if (url.pathname !== '/feed.ics' && url.pathname !== '/feed.json') {
      return new Response('Not found', { status: 404 });
    }

    const { response, cacheHit } = await serveFeed(request, url, env, ctx);
    recordUsage(env, request, { status: response.status, cacheHit });
    return response;
  },
};

/** Build the feed response. Split from fetch() so every outcome — cache hit, 400, 500 —
 *  passes through one place where its usage row is written. */
async function serveFeed(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<{ response: Response; cacheHit: boolean }> {
  const reply = (response: Response, cacheHit = false) => ({ response, cacheHit });

  const parsed = parseParams(url);
  // An unknown slug never contributes events. Dropping it here rather than in fetchEvents
  // also keeps it out of the calendar name and the cache key, where every made-up slug
  // would otherwise be a fresh, uncacheable variant of the same feed.
  const params = { ...parsed, categories: parsed.categories.filter((slug) => KNOWN_CATEGORIES.has(slug)) };
  const onlyRetired =
    params.categories.length === 0 && parsed.categories.some((slug) => RETIRED_CATEGORIES.includes(slug));
  if (params.categories.length === 0 && !onlyRetired) {
    return reply(new Response('Provide at least one category via ?c=', { status: 400 }));
  }
  if (params.lat !== undefined && params.lat !== 0) {
    const latIsNorth = params.lat > 0;
    if (latIsNorth !== (params.hemisphere === 'northern')) {
      return reply(new Response('Hemisphere and latitude do not match', { status: 400 }));
    }
  }

  if (isFixedOffsetTimezone(params.tz)) {
    // Carries no DST rules, so contact times drift by an hour for half the year if the
    // subscriber's region observes DST. Logged rather than corrected because the real
    // zone cannot be recovered from an offset — see isFixedOffsetTimezone.
    console.warn('Fixed-offset timezone requested:', params.tz);
  }

  const cacheKey = buildCacheKey(url, params, env.DEPLOY_ID);
  const cached = await caches.default.match(cacheKey);
  if (cached) return reply(notModifiedIfMatched(request, cached), true);

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
    return reply(notModifiedIfMatched(request, response));
  } catch (err) {
    console.error('Feed error:', err);
    return reply(new Response('Internal server error', { status: 500 }));
  }
}

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

/** How each request parameter enters the edge-cache key; undefined leaves it out.
 *
 *  Typed over every RequestParams field so that adding one without deciding its place here
 *  fails to compile. A parameter that shapes the body but is missing from the key would
 *  serve one subscriber's feed to another. `club` only shapes the astronomy-clubs
 *  category, so it is keyed only with it. */
const CACHE_KEY_PARTS: Record<keyof RequestParams, (params: RequestParams) => string | undefined> = {
  categories: (p) => p.categories.join(','),
  lat: (p) => p.lat?.toString(),
  lon: (p) => p.lon?.toString(),
  tz: (p) => p.tz,
  hemisphere: (p) => p.hemisphere ?? 'northern',
  club: (p) => (p.categories.includes('astronomy-clubs') ? p.club : undefined),
};

/** The edge-cache key: the path plus the parameters, rebuilt from what parseParams
 *  understood rather than copied from the request URL.
 *
 *  Copying the URL keyed the cache on anything a caller appended — `&_bust=<timestamp>`,
 *  junk parameters, a lat spelled 45.2 instead of 45 — so each variant missed the cache and
 *  rebuilt the feed from KV. It also leaves out who is asking: `sid` is unique per
 *  subscriber, and keying on it would give everyone a private entry that only they ever
 *  hit. Category order stays in the key because it shapes the body: it orders the calendar
 *  name and events that start at the same moment. */
function buildCacheKey(url: URL, params: RequestParams, deployId?: string): Request {
  const key = new URL(url.pathname, url.origin);
  for (const [name, part] of Object.entries(CACHE_KEY_PARTS)) {
    const value = part(params);
    if (value !== undefined) key.searchParams.set(name, value);
  }
  if (deployId) key.searchParams.set('_v', deployId);
  return new Request(key.toString());
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
  // Empty when every category the subscription asked for has been retired.
  if (categories.length === 0 || categories.length > 2) return 'Space Calendar';
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
