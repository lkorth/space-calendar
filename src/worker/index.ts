import { buildICS } from './ics.ts';
import { makeStaticCategory } from './categories/static.ts';
import { launchesCategory } from './categories/launches.ts';
import { auroraCategory } from './categories/aurora.ts';
import { STATIC_CATEGORIES } from '../shared/models.ts';
import type { Category, CategorySlug, Env, RequestParams } from '../shared/models.ts';

const CATEGORIES: Map<CategorySlug, Category> = new Map([
  ...STATIC_CATEGORIES.map(
    (slug) => [slug, makeStaticCategory(slug)] as [CategorySlug, Category],
  ),
  ['launches', launchesCategory],
  ['aurora', auroraCategory],
]);

export default {
  async fetch(request: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.redirect('https://space-calendar.pages.dev', 301);
    }

    if (url.pathname !== '/feed.ics') {
      return new Response('Not found', { status: 404 });
    }

    const params = parseParams(url);
    if (params.categories.length === 0) {
      return new Response('Provide at least one category via ?c=', { status: 400 });
    }

    try {
      const events = (
        await Promise.all(
          params.categories.map((slug) => {
            const category = CATEGORIES.get(slug);
            return category ? category.fetch(env, params) : Promise.resolve([]);
          }),
        )
      )
        .flat()
        .sort((a, b) => a.start.localeCompare(b.start));

      const calName = buildCalName(params.categories);
      const ics = buildICS(events, calName);

      return new Response(ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Content-Disposition': 'attachment; filename="space-calendar.ics"',
        },
      });
    } catch (err) {
      console.error('Feed error:', err);
      return new Response('Internal server error', { status: 500 });
    }
  },
};

function parseParams(url: URL): RequestParams {
  const rawCategories = (url.searchParams.get('c') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as CategorySlug[];

  const rawLat = url.searchParams.get('lat');
  const lat = rawLat ? Math.round(parseFloat(rawLat)) : undefined;

  return { categories: rawCategories, lat };
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
    launches: 'Rocket Launches',
    history: 'Space History',
    aurora: 'Aurora Borealis',
  };
  return categories.map((s) => labels[s] ?? s).join(', ');
}
