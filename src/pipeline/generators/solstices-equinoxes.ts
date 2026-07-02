import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

// USNO returns phenom as "Equinox" or "Solstice" — use month to determine which.
// January=Perihelion and July=Aphelion are also returned; we skip those.
function phenomMeta(phenom: string, month: number): { title: string; description: string } | null {
  if (phenom === 'Equinox' && month === 3) return {
    title: '🌸 March Equinox — Vernal Equinox (Northern Hemisphere)',
    description: `The Sun crosses the celestial equator today, rising almost exactly due east and setting almost exactly due west — as close to true east and west as it gets all year. In the Northern Hemisphere days are now growing longer by about 3 minutes each day; in the Southern Hemisphere, shortening.\n\nThis moment marks the astronomical start of spring in the Northern Hemisphere and autumn in the Southern. Ancient monuments from Stonehenge to the Pyramid of Chichén Itzá were oriented to mark it — evidence of how reliably humans have tracked this turning point for thousands of years.`,
  };
  if (phenom === 'Equinox' && month === 9) return {
    title: '🍂 September Equinox — Autumnal Equinox (Northern Hemisphere)',
    description: `The Sun crosses the celestial equator moving southward, once again rising nearly due east and setting nearly due west. From today, nights in the Northern Hemisphere grow longer by about 3 minutes each day until the December solstice.\n\nNotice the angle of midday sunlight today compared to the June solstice — the difference makes the seasonal shift concrete. Many harvest festivals cluster around this time: across temperate cultures worldwide, the Sun's southward march reliably signaled the end of the growing season.`,
  };
  if (phenom === 'Solstice' && month === 6) return {
    title: '☀️ June Solstice — Summer Solstice (Northern Hemisphere)',
    description: `The Sun rises at its northernmost point on the horizon and follows its highest arc across the midday sky — today is the longest day of the year in the Northern Hemisphere. North of the Arctic Circle the Sun doesn't set at all. In the Southern Hemisphere this is the winter solstice and the shortest day.\n\nAfter today, days begin shortening — slowly at first, then more rapidly. Despite being the longest day, the hottest days of summer typically lag 4–6 weeks behind: land and ocean keep absorbing heat long after the solstice. Stonehenge's main axis aligns with the midsummer sunrise, and cultures worldwide have marked this turning point for thousands of years.`,
  };
  if (phenom === 'Solstice' && month === 12) return {
    title: '❄️ December Solstice — Winter Solstice (Northern Hemisphere)',
    description: `The Sun rises at its southernmost point on the horizon and follows its lowest arc across the midday sky — today is the shortest day of the year in the Northern Hemisphere. Near the Arctic Circle only a few hours of pale twilight are visible. After today, days begin growing longer again.\n\nThe December solstice has been marked by virtually every human culture: Roman Saturnalia, Norse Yule, Persian Yalda Night, China's Dongzhi, and the Christian Christmas all cluster around this turning point. Stonehenge's main axis aligns with the setting midwinter Sun, suggesting it was meaningful to its builders 5,000 years ago. In the Southern Hemisphere today is the summer solstice — the longest day of the year.`,
  };
  return null; // Perihelion, Aphelion, or unexpected value — skip
}

export const solsticesEquinoxesGenerator: Generator = {
  slug: 'solstices-equinoxes',
  schedule: 'monthly',

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
