import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

const OPPOSITION_BODIES = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const ELONGATION_BODIES = ['Mercury', 'Venus'];

function makeDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

export const oppositionsGenerator: Generator = {
  slug: 'oppositions',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.planetaryPhenomena(year);
    return data.data
      .filter(
        (e) =>
          OPPOSITION_BODIES.includes(e.body) &&
          e.phenom.toLowerCase().includes('opposition'),
      )
      .map((e) => {
        const dateStr = makeDateStr(year, e.month, e.day);
        return {
          uid: `opposition-${e.body.toLowerCase()}-${dateStr}@space-calendar`,
          title: `${e.body} at Opposition — Closest & Brightest`,
          start: dateStr,
          end: nextDayStr(dateStr),
          allDay: true,
          description: describeOpposition(e.body),
          url: `https://solarsystem.nasa.gov/planets/${e.body.toLowerCase()}/overview/`,
          category: 'oppositions',
        };
      });
  },
};

export const elongationsGenerator: Generator = {
  slug: 'elongations',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.planetaryPhenomena(year);
    return data.data
      .filter(
        (e) =>
          ELONGATION_BODIES.includes(e.body) &&
          e.phenom.toLowerCase().includes('elongation'),
      )
      .map((e) => {
        const isEastern = e.phenom.toLowerCase().includes('eastern');
        const dateStr = makeDateStr(year, e.month, e.day);
        const sky = isEastern ? 'Evening Star' : 'Morning Star';
        const direction = isEastern ? 'Eastern' : 'Western';
        return {
          uid: `elongation-${e.body.toLowerCase()}-${direction.toLowerCase()}-${dateStr}@space-calendar`,
          title: `${e.body} at Greatest ${direction} Elongation — ${sky}`,
          start: dateStr,
          end: nextDayStr(dateStr),
          allDay: true,
          description: describeElongation(e.body, isEastern),
          url: 'https://aa.usno.navy.mil/data/planets',
          category: 'elongations',
        };
      });
  },
};

function describeOpposition(body: string): string {
  const descriptions: Record<string, string> = {
    Mars: "Mars reaches opposition — Earth is directly between Mars and the Sun, making the Red Planet closer and brighter than at any other point in its two-year cycle. Look for a distinctly reddish-orange 'star' rising in the east at sunset. Through binoculars or a small telescope, Mars's polar ice caps and dark surface markings may be visible.",
    Jupiter:
      "Jupiter reaches opposition, its closest and brightest point of the year. Shining brilliantly, it rises at sunset and is visible all night. Even binoculars will reveal Jupiter's four Galilean moons (Io, Europa, Ganymede, Callisto), while a small telescope shows the cloud bands and the Great Red Spot.",
    Saturn:
      "Saturn reaches opposition — its closest and brightest point of the year. The ringed planet rises at sunset and is visible all night. A small telescope at 30× or more will clearly show Saturn's rings, which are tilted at varying angles depending on the year. The moon Titan is also visible.",
    Uranus:
      'Uranus reaches opposition, its closest approach to Earth this year. At magnitude ~5.7, it sits right at the edge of naked-eye visibility from a very dark site. Binoculars easily reveal it as a small greenish-blue disk, distinct from background stars.',
    Neptune:
      'Neptune reaches opposition, its closest approach to Earth this year. At magnitude ~7.8 it requires binoculars at minimum — a small telescope will show its distinctive blue-grey disk. It was the last planet discovered in our solar system (1846) and remains the most distant.',
  };
  return (
    descriptions[body] ??
    `${body} reaches opposition — its closest and brightest point of the year. Visible all night, rising at sunset.`
  );
}

function describeElongation(body: string, eastern: boolean): string {
  const sky = eastern
    ? 'low in the western sky shortly after sunset'
    : 'low in the eastern sky just before sunrise';
  const look = eastern ? 'Look west after sunset' : 'Look east before sunrise';
  if (body === 'Mercury') {
    return `Mercury reaches its greatest angular separation from the Sun, making this the best window to spot the innermost planet. Look for it ${sky}. ${look} — Mercury sets or rises with the twilight and is only visible for a short window. Its small size means it never strays far from the Sun in our sky.`;
  }
  return `Venus reaches its greatest angular separation from the Sun — the best viewing opportunity of this apparition. Find it ${sky}, shining brilliantly at magnitude −4 or brighter, far outshining every other star and planet. ${look} and it will be unmistakable.`;
}
