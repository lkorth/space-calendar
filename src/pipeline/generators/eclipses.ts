import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

function parseEclipseDateTime(e: { year: number; month: number; day: number; time: string }): Date {
  return new Date(
    `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}T${e.time}:00Z`,
  );
}

export const solarEclipsesGenerator: Generator = {
  slug: 'eclipses-solar',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.solarEclipses(year);
    return data.eclipses_in_year.map((eclipse) => {
      const dt = parseEclipseDateTime(eclipse);
      const type = eclipse.event.toLowerCase().includes('total')
        ? 'Total'
        : eclipse.event.toLowerCase().includes('annular')
          ? 'Annular'
          : eclipse.event.toLowerCase().includes('hybrid')
            ? 'Hybrid'
            : 'Partial';
      const region = eclipse.region ? ` — ${eclipse.region}` : '';
      return {
        uid: `eclipse-solar-${dt.toISOString()}@space-calendar`,
        title: `${type} Solar Eclipse${region}`,
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description: describeSolarEclipse(type, eclipse.region),
        url: `https://science.nasa.gov/eclipses/`,
        category: 'eclipses-solar',
      };
    });
  },
};

export const lunarEclipsesGenerator: Generator = {
  slug: 'eclipses-lunar',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.lunarEclipses(year);
    return data.eclipses_in_year.map((eclipse) => {
      const dt = parseEclipseDateTime(eclipse);
      const type = eclipse.event.toLowerCase().includes('total')
        ? 'Total'
        : eclipse.event.toLowerCase().includes('partial')
          ? 'Partial'
          : 'Penumbral';
      const suffix = type === 'Total' ? ' — Blood Moon' : '';
      return {
        uid: `eclipse-lunar-${dt.toISOString()}@space-calendar`,
        title: `${type} Lunar Eclipse${suffix}`,
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description: describeLunarEclipse(type),
        url: `https://science.nasa.gov/eclipses/`,
        category: 'eclipses-lunar',
      };
    });
  },
};

function describeSolarEclipse(type: string, region?: string): string {
  const where = region ? `visible from ${region}` : 'visible from parts of Earth';
  switch (type) {
    case 'Total':
      return [
        `A total solar eclipse is one of nature's most dramatic events. The Moon completely blocks the Sun, turning day briefly to twilight and revealing the Sun's corona — its outer atmosphere — to the naked eye. Totality is ${where}.`,
        `Outside the path of totality, observers will see a partial eclipse. Never look directly at the Sun except during the brief moments of full totality. See the event body for a full phase timetable in UTC across the visibility region.`,
      ].join('\n\n');
    case 'Annular':
      return [
        `An annular solar eclipse occurs when the Moon is slightly farther from Earth than usual, making it appear too small to fully cover the Sun. The result is a brilliant "ring of fire" — a thin ring of sunlight surrounding the Moon's silhouette. The annular path is ${where}.`,
        `Unlike totality, the ring phase is never safe to view without eclipse glasses — the Sun is never fully blocked. See the event body for a full phase timetable in UTC.`,
      ].join('\n\n');
    default:
      return `A partial solar eclipse is ${where}. The Moon covers only a portion of the Sun's disk. Eclipse glasses are required for safe viewing throughout the event.`;
  }
}

function describeLunarEclipse(type: string): string {
  switch (type) {
    case 'Total':
      return [
        `During a total lunar eclipse, Earth passes directly between the Sun and Moon, casting its full shadow (umbra) across the lunar surface. The Moon takes on a deep red or orange hue — a "Blood Moon" — caused by sunlight bending through Earth's atmosphere and scattering onto the Moon.`,
        `Unlike solar eclipses, a lunar eclipse is safe to observe with the naked eye and visible from anywhere on the night side of Earth. See the event body for a full phase timetable in UTC.`,
      ].join('\n\n');
    case 'Partial':
      return `During a partial lunar eclipse, Earth's umbra covers only part of the Moon, creating a striking bitten-out appearance. Safe to observe with the naked eye from the night side of Earth. See the event body for a full phase timetable in UTC.`;
    default:
      return `A penumbral lunar eclipse is subtle — the Moon passes through Earth's outer shadow (penumbra), causing a slight dimming that is difficult to notice without careful observation. No special equipment needed, but the effect is easy to miss. See the event body for a full phase timetable in UTC.`;
  }
}
