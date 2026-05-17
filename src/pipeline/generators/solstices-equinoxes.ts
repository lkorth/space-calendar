import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

// USNO returns phenom as "Equinox" or "Solstice" — use month to determine which.
// January=Perihelion and July=Aphelion are also returned; we skip those.
function phenomMeta(phenom: string, month: number): { title: string; description: string } | null {
  if (phenom === 'Equinox' && month === 3) return {
    title: '🌸 March Equinox — Vernal Equinox (Northern Hemisphere)',
    description: 'The Sun crosses the celestial equator moving northward. Day and night are approximately equal in length worldwide. In the Northern Hemisphere this marks the astronomical start of spring; in the Southern Hemisphere, the start of autumn. Many cultures have marked this moment for millennia.',
  };
  if (phenom === 'Equinox' && month === 9) return {
    title: '🍂 September Equinox — Autumnal Equinox (Northern Hemisphere)',
    description: 'The Sun crosses the celestial equator moving southward. Day and night are again approximately equal. In the Northern Hemisphere this marks the astronomical start of autumn; in the Southern Hemisphere, the start of spring.',
  };
  if (phenom === 'Solstice' && month === 6) return {
    title: '☀️ June Solstice — Summer Solstice (Northern Hemisphere)',
    description: "The Sun reaches its northernmost point in the sky — the longest day of the year in the Northern Hemisphere and the shortest in the Southern. Earth's axial tilt of 23.5° is what produces seasons; today that tilt points the Northern Hemisphere most directly toward the Sun.",
  };
  if (phenom === 'Solstice' && month === 12) return {
    title: '❄️ December Solstice — Winter Solstice (Northern Hemisphere)',
    description: "The Sun reaches its southernmost point — the shortest day of the year in the Northern Hemisphere and the longest in the Southern. After today, days begin lengthening again in the Northern Hemisphere. The solstice has been celebrated across virtually every human culture, from Stonehenge to Dongzhi.",
  };
  return null; // Perihelion, Aphelion, or unexpected value — skip
}

export const solsticesEquinoxesGenerator: Generator = {
  slug: 'solstices-equinoxes',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.seasons(year);
    const events: CalendarEvent[] = [];

    for (const season of data.data) {
      const meta = phenomMeta(season.phenom, season.month);
      if (!meta) continue;

      const dt = new Date(
        `${year}-${String(season.month).padStart(2, '0')}-${String(season.day).padStart(2, '0')}T${season.time}:00Z`,
      );

      events.push({
        uid: `season-${season.phenom.toLowerCase()}-${season.month}-${year}@space-calendar`,
        title: meta.title,
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description: meta.description,
        url: 'https://aa.usno.navy.mil/data/EarthSeasons',
        category: 'solstices-equinoxes',
      });
    }

    return events;
  },
};
