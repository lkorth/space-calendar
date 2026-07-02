import { fetchCloseApproaches } from '../clients/jpl.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';
import type { ParsedCloseApproach } from '../clients/jpl.ts';

/** H ≤ 22 ≈ diameter ≥ ~140m — notable at any close-approach distance up to LD_MAX */
const H_MAX = 22;
/** Maximum distance in lunar distances for standard-sized objects */
const LD_MAX = 10;
/** H ≤ 26.5 ≈ diameter ≥ ~18m — Chelyabinsk-class; notable when passing sub-lunar */
const H_MAX_SUB_LUNAR = 26.5;
/** Sub-lunar threshold in AU (1 LD ≈ 384,400 km / 149,597,870.7 km/AU) */
const SUB_LUNAR_AU = 0.00257;

export function isNotableApproach(a: ParsedCloseApproach): boolean {
  if (a.dist_ld <= 1) return a.h <= H_MAX_SUB_LUNAR;
  return a.dist_ld <= LD_MAX && a.h <= H_MAX;
}

export const asteroidsGenerator: Generator = {
  slug: 'asteroids',
  schedule: 'weekly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const [standard, subLunar] = await Promise.all([
      fetchCloseApproaches(year, { distMaxAu: 0.05, hMax: H_MAX }),
      fetchCloseApproaches(year, { distMaxAu: SUB_LUNAR_AU }),
    ]);

    // Merge and deduplicate by designation + date
    const seen = new Set<string>();
    const approaches = [...subLunar, ...standard].filter((a) => {
      const key = `${a.des}|${a.cd}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return approaches
      .filter(isNotableApproach)
      .sort((a, b) => a.cd.localeCompare(b.cd))
      .map((a) => {
        const dt = new Date(a.cd + 'Z');
        const ldRounded = a.dist_ld.toFixed(1);
        const kmFormatted = (a.dist_au * 149_597_870.7).toLocaleString('en-US', {
          maximumFractionDigits: 0,
        });
        const moonRef = a.dist_ld < 1
          ? '— passing inside the Moon\'s orbit'
          : `— about ${ldRounded}× the Moon's distance from Earth`;
        return {
          uid: `asteroid-${a.des.replace(/\s+/g, '-').toLowerCase()}-${dt.toISOString()}@space-calendar`,
          title: `🪨 Asteroid ${a.des} — Close Earth Flyby`,
          start: dt.toISOString(),
          end: dt.toISOString(),
          allDay: false,
          description: [
            `Asteroid ${a.des} makes its closest approach to Earth, passing at ${ldRounded} lunar distances (${kmFormatted} km) ${moonRef}. There is no impact risk.`,
            `The asteroid has an absolute magnitude (H) of ${a.h.toFixed(1)}, suggesting a diameter of roughly ${estimateDiameter(a.h)} and a flyby velocity of ${a.v_rel_kms.toFixed(1)} km/s relative to Earth. ${asteroidContext(a.h, a.dist_ld)}`,
          ].join('\n\n'),
          url: `https://cneos.jpl.nasa.gov/ca/`,
          category: 'asteroids',
        };
      });
  },
};

function estimateDiameter(h: number): string {
  const km = (1329 / Math.sqrt(0.14)) * Math.pow(10, -h / 5);
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${(km * 1000).toFixed(0)} m`;
}

function asteroidContext(h: number, dist_ld: number): string {
  if (h <= 18) {
    return `At this size it qualifies as a Potentially Hazardous Asteroid. This close approach is a priority target for planetary radar observation to sharpen its orbital solution.`;
  }
  if (h <= 22) {
    return `At this size, NASA's Center for Near Earth Object Studies (CNEOS) tracks it closely — close approaches like this are used to refine its orbital solution and improve the accuracy of future predictions.`;
  }
  if (dist_ld <= 1) {
    return `Passing inside the Moon's orbit, this is close enough that CNEOS catalogs the approach to keep Earth's near-Earth object database current and orbital solutions well-constrained.`;
  }
  return `Close approaches like this help astronomers refine orbital calculations and keep the near-Earth object catalog current.`;
}
