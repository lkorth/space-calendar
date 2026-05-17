import { usno } from '../clients/usno.ts';
import type { MoonPhase } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

export function messierMarathonDate(year: number, phases: MoonPhase[]): string {
  const target = Date.UTC(year, 2, 19); // March 19
  const newMoons = phases.filter((p) => p.phase === 'New Moon');
  if (newMoons.length === 0) throw new Error(`No new moons found in phase data for ${year}`);

  const closest = newMoons.reduce((best, p) => {
    const d = Date.UTC(p.year, p.month - 1, p.day);
    const bestD = Date.UTC(best.year, best.month - 1, best.day);
    return Math.abs(d - target) < Math.abs(bestD - target) ? p : best;
  });

  return `${closest.year}-${String(closest.month).padStart(2, '0')}-${String(closest.day).padStart(2, '0')}`;
}

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

export const deepSkyGenerator: Generator = {
  slug: 'deep-sky',
  schedule: 'monthly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const { phasedata } = await usno.moonPhases(year);
    const dateStr = messierMarathonDate(year, phasedata);

    return [
      {
        uid: `messier-marathon-${year}@space-calendar`,
        title: '🌌 Messier Marathon',
        start: dateStr,
        end: nextDayStr(dateStr),
        allDay: true,
        description: [
          `The Messier Marathon is an annual observing tradition where amateur astronomers attempt to spot all 110 Messier objects — galaxies, nebulae, star clusters, and more — in a single night. Tonight is the optimal window: the new moon keeps skies dark, and the geometry of the Sun's position allows all 110 objects to be above the horizon at some point during the night.`,
          `Start at dusk looking west for galaxies M74 and M77 before they set, then sweep east through the night, finishing at dawn with M30 rising in the southeast. A dark-sky site, a star atlas or planetarium app, and a telescope or binoculars are all you need. It typically takes 6–8 hours and a clear, dark night to complete.`,
          `Best from latitudes 25°N–35°N, where all 110 objects clear the horizon. Observers at higher latitudes may miss a few far-southern objects but can still attempt a near-complete run.`,
        ].join('\n\n'),
        url: 'https://en.wikipedia.org/wiki/Messier_marathon',
        category: 'deep-sky',
      },
    ];
  },
};
