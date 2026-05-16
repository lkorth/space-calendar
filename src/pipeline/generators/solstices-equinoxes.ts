import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

const PHENOM_META: Record<string, { title: string; description: string }> = {
  'March Equinox': {
    title: 'March Equinox — Vernal Equinox (Northern Hemisphere)',
    description:
      'The Sun crosses the celestial equator moving northward. Day and night are approximately equal in length worldwide. In the Northern Hemisphere this marks the astronomical start of spring; in the Southern Hemisphere, the start of autumn. Many cultures have marked this moment for millennia.',
  },
  'June Solstice': {
    title: 'June Solstice — Summer Solstice (Northern Hemisphere)',
    description:
      "The Sun reaches its northernmost point in the sky — the longest day of the year in the Northern Hemisphere and the shortest in the Southern. Earth's axial tilt of 23.5° is what produces seasons; today that tilt points the Northern Hemisphere most directly toward the Sun.",
  },
  'September Equinox': {
    title: 'September Equinox — Autumnal Equinox (Northern Hemisphere)',
    description:
      'The Sun crosses the celestial equator moving southward. Day and night are again approximately equal. In the Northern Hemisphere this marks the astronomical start of autumn; in the Southern Hemisphere, the start of spring.',
  },
  'December Solstice': {
    title: 'December Solstice — Winter Solstice (Northern Hemisphere)',
    description:
      "The Sun reaches its southernmost point — the shortest day of the year in the Northern Hemisphere and the longest in the Southern. After today, days begin lengthening again in the Northern Hemisphere. The solstice has been celebrated across virtually every human culture, from Stonehenge to Dongzhi.",
  },
};

export const solsticesEquinoxesGenerator: Generator = {
  slug: 'solstices-equinoxes',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.seasons(year);
    return data.data.map((season) => {
      const meta = PHENOM_META[season.phenom];
      const dt = new Date(
        `${year}-${String(season.month).padStart(2, '0')}-${String(season.day).padStart(2, '0')}T${season.time}:00Z`,
      );
      return {
        uid: `season-${season.phenom.toLowerCase().replace(/\s+/g, '-')}-${year}@space-calendar`,
        title: meta?.title ?? season.phenom,
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description: meta?.description ?? '',
        url: 'https://aa.usno.navy.mil/data/EarthSeasons',
        category: 'solstices-equinoxes',
      };
    });
  },
};
