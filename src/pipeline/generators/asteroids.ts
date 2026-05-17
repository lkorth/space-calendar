import { fetchCloseApproaches } from '../clients/jpl.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';
import type { ParsedCloseApproach } from '../clients/jpl.ts';

/** H ≤ 22 ≈ diameter ≥ ~140m — notable at any close-approach distance up to LD_MAX */
const H_MAX = 22;
/** Maximum distance in lunar distances for standard-sized objects */
const LD_MAX = 10;
/** H ≤ 26 ≈ diameter ≥ ~22m — Chelyabinsk-class; notable when passing sub-lunar */
const H_MAX_SUB_LUNAR = 26;
/** Sub-lunar threshold in AU (1 LD ≈ 384,400 km / 149,597,870.7 km/AU) */
const SUB_LUNAR_AU = 0.00257;

export function isNotableApproach(a: ParsedCloseApproach): boolean {
  if (a.dist_ld <= 1) return a.h <= H_MAX_SUB_LUNAR;
  return a.dist_ld <= LD_MAX && a.h <= H_MAX;
}

export const asteroidsGenerator: Generator = {
  slug: 'asteroids',
  schedule: 'monthly',

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
        return {
          uid: `asteroid-${a.des.replace(/\s+/g, '-').toLowerCase()}-${dt.toISOString()}@space-calendar`,
          title: `🪨 Asteroid ${a.des} — Close Earth Flyby`,
          start: dt.toISOString(),
          end: dt.toISOString(),
          allDay: false,
          description: [
            `Asteroid ${a.des} makes its closest approach to Earth, passing at ${ldRounded} lunar distances (${kmFormatted} km). For reference, the Moon is 1 lunar distance away — this asteroid will pass ${ldRounded}× farther than the Moon. There is no impact risk.`,
            `The asteroid has an absolute magnitude (H) of ${a.h.toFixed(1)}, suggesting a diameter of roughly ${estimateDiameter(a.h)} and a flyby velocity of ${a.v_rel_kms.toFixed(1)} km/s relative to Earth. Close approaches like this are opportunities for radar observation and scientific characterization.`,
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
