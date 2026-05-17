import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

const FULL_MOON_NAMES: Record<number, string> = {
  1: 'Wolf Moon',
  2: 'Snow Moon',
  3: 'Worm Moon',
  4: 'Pink Moon',
  5: 'Flower Moon',
  6: 'Strawberry Moon',
  7: 'Buck Moon',
  8: 'Sturgeon Moon',
  9: 'Corn Moon',
  10: "Hunter's Moon",
  11: 'Beaver Moon',
  12: 'Cold Moon',
};

const FULL_MOON_NAME_ORIGINS: Record<string, string> = {
  'Wolf Moon': 'Named for the wolves that howled outside villages on cold winter nights, in Native American and colonial American traditions.',
  'Snow Moon': 'Named for the heavy snowfall common in February in many Indigenous North American traditions. Also called the Hunger Moon.',
  'Worm Moon': 'Named for the earthworms that emerge as the ground begins to thaw in early spring. Also called the Crow Moon, Crust Moon, or Sap Moon.',
  'Pink Moon': 'Named not for its color but for the wild ground phlox (moss pink), one of the first wildflowers to bloom across North America in April.',
  'Flower Moon': 'Named for the abundant flowers blooming across North America and Europe in May.',
  'Strawberry Moon': "Named by Algonquin peoples for June's brief strawberry harvesting season in northeastern North America.",
  'Buck Moon': 'Named for the time of year when male white-tailed deer begin growing their new antlers in velvet.',
  'Sturgeon Moon': 'Named by Algonquin peoples for the large sturgeon fish of the Great Lakes, most readily caught during August.',
  'Corn Moon': 'Named for the corn harvest beginning in early autumn. Also called the Barley Moon.',
  'Harvest Moon': "The full moon nearest to the September equinox. It rises near sunset for several consecutive nights, historically extending the daylight hours available for bringing in the harvest.",
  "Hunter's Moon": "The first full moon after the Harvest Moon. Like the Harvest Moon, it rises soon after sunset for several nights — traditionally used for hunting deer and fox by moonlight before winter's onset.",
  'Beaver Moon': "Named for beavers' peak dam-building activity before freeze-up, and historically the time trappers set beaver traps before waterways iced over.",
  'Cold Moon': 'Named for the long, cold nights of December. Also called the Long Night Moon or the Oak Moon.',
};

export const moonPhasesGenerator: Generator = {
  slug: 'moon-phases',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const [phasesData, seasonsData] = await Promise.all([
      usno.moonPhases(year),
      usno.seasons(year),
    ]);

    const fullMoonPhases = phasesData.phasedata.filter((p) => p.phase === 'Full Moon');
    const newMoonPhases = phasesData.phasedata.filter((p) => p.phase === 'New Moon');

    // Find September equinox for Harvest Moon / Hunter's Moon calculation
    const septEquinox = seasonsData.data.find((s) => s.phenom === 'Equinox' && s.month === 9);
    const equinoxDate = septEquinox
      ? new Date(`${year}-${String(septEquinox.month).padStart(2, '0')}-${String(septEquinox.day).padStart(2, '0')}T${septEquinox.time}:00Z`)
      : new Date(`${year}-09-22T12:00:00Z`);

    const fullMoonDates = fullMoonPhases.map(
      (p) => new Date(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${p.time}:00Z`),
    );

    // Harvest Moon = full moon closest to the September equinox
    let harvestMoonIndex = 0;
    let minDiff = Infinity;
    for (let i = 0; i < fullMoonDates.length; i++) {
      const diff = Math.abs(fullMoonDates[i]!.getTime() - equinoxDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        harvestMoonIndex = i;
      }
    }

    const events: CalendarEvent[] = [];

    for (let i = 0; i < fullMoonPhases.length; i++) {
      const dt = fullMoonDates[i]!;
      const month = dt.getUTCMonth() + 1;

      let name: string;
      if (i === harvestMoonIndex) {
        name = 'Harvest Moon';
      } else if (i === harvestMoonIndex + 1) {
        name = "Hunter's Moon";
      } else {
        name = FULL_MOON_NAMES[month] ?? 'Full Moon';
      }

      events.push({
        uid: `moon-phase-${dt.toISOString()}@space-calendar`,
        title: `Full Moon — ${name}`,
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description: describeFullMoon(name),
        url: 'https://aa.usno.navy.mil/data/MoonPhases',
        category: 'moon-phases',
      });
    }

    for (const phase of newMoonPhases) {
      const dt = new Date(
        `${phase.year}-${String(phase.month).padStart(2, '0')}-${String(phase.day).padStart(2, '0')}T${phase.time}:00Z`,
      );
      events.push({
        uid: `moon-phase-${dt.toISOString()}@space-calendar`,
        title: 'New Moon',
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description:
          'The Moon is between Earth and the Sun, with its illuminated side facing away from us. The night sky is at its darkest — ideal for deep-sky observing. New moons also mark the start of each lunar cycle.',
        url: 'https://aa.usno.navy.mil/data/MoonPhases',
        category: 'moon-phases',
      });
    }

    return events.sort((a, b) => a.start.localeCompare(b.start));
  },
};

function describeFullMoon(name: string): string {
  const origin = FULL_MOON_NAME_ORIGINS[name];
  const base =
    'The Moon rises at sunset and is visible all night, fully illuminated by the Sun. The bright light washes out fainter stars and deep-sky objects, but the Moon itself is a spectacular sight — especially near the horizon due to the Moon illusion.';
  return origin ? `${base}\n\n${origin}` : base;
}
