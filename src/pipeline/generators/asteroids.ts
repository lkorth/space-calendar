import { fetchCloseApproaches } from '../clients/jpl.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

/** Minimum size proxy: H < 22 ≈ diameter > ~140m. Adjust to tune notability. */
const H_MAX = 22;
/** Maximum distance in lunar distances to be considered notable */
const LD_MAX = 10;

export const asteroidsGenerator: Generator = {
  slug: 'asteroids',
  schedule: 'monthly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const approaches = await fetchCloseApproaches(year);
    return approaches
      .filter((a) => a.dist_ld <= LD_MAX && a.h <= H_MAX)
      .map((a) => {
        const dt = new Date(a.cd + 'Z');
        const ldRounded = a.dist_ld.toFixed(1);
        const kmFormatted = (a.dist_au * 149_597_870.7).toLocaleString('en-US', {
          maximumFractionDigits: 0,
        });
        return {
          uid: `asteroid-${a.des.replace(/\s+/g, '-').toLowerCase()}-${dt.toISOString()}@space-calendar`,
          title: `Asteroid ${a.des} — Close Earth Flyby`,
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
  // Rough estimate assuming geometric albedo of 0.14
  const km = 1329 / Math.sqrt(0.14) * Math.pow(10, -h / 5);
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${(km * 1000).toFixed(0)} m`;
}
