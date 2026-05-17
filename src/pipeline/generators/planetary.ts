import { fetchPlanetaryEvents } from '../clients/jpl.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

export const oppositionsGenerator: Generator = {
  slug: 'oppositions',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const events = await fetchPlanetaryEvents(year);
    return events
      .filter((e) => e.type === 'opposition')
      .map((e) => ({
        uid: `opposition-${e.name.toLowerCase()}-${e.date}@space-calendar`,
        title: `🔭 ${e.name} at Opposition — Closest & Brightest`,
        start: e.date,
        end: nextDayStr(e.date),
        allDay: true,
        description: describeOpposition(e.name),
        url: `https://solarsystem.nasa.gov/planets/${e.name.toLowerCase()}/overview/`,
        category: 'oppositions',
      }));
  },
};

export const elongationsGenerator: Generator = {
  slug: 'elongations',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const events = await fetchPlanetaryEvents(year);
    return events
      .filter((e) => e.type.startsWith('greatest-elongation'))
      .map((e) => {
        const isEast = e.type === 'greatest-elongation-east';
        const direction = isEast ? 'Eastern' : 'Western';
        const sky = isEast ? 'Evening Star' : 'Morning Star';
        return {
          uid: `elongation-${e.name.toLowerCase()}-${e.type}-${e.date}@space-calendar`,
          title: `🔭 ${e.name} at Greatest ${direction} Elongation — ${sky}`,
          start: e.date,
          end: nextDayStr(e.date),
          allDay: true,
          description: describeElongation(e.name, isEast, e.elongation),
          url: 'https://aa.usno.navy.mil/data/planets',
          category: 'elongations',
        };
      });
  },
};

function describeOpposition(body: string): string {
  const descriptions: Record<string, string> = {
    Mars: "Mars reaches opposition — Earth is directly between Mars and the Sun, making the Red Planet closer and brighter than at any other point in its roughly two-year cycle. Look for a distinctly reddish-orange 'star' rising in the east at sunset. Through a small telescope, Mars's polar ice caps and dark surface markings may be visible.",
    Jupiter: "Jupiter reaches opposition, its closest and brightest point of the year. Shining brilliantly, it rises at sunset and is visible all night. Even binoculars will reveal Jupiter's four Galilean moons (Io, Europa, Ganymede, Callisto), while a small telescope shows the cloud bands and the Great Red Spot.",
    Saturn: "Saturn reaches opposition — its closest and brightest point of the year. The ringed planet rises at sunset and is visible all night. A small telescope at 30× or more will clearly show Saturn's rings and the moon Titan.",
    Uranus: "Uranus reaches opposition, its closest approach to Earth this year. At magnitude ~5.7 it sits right at the edge of naked-eye visibility from a very dark site. Binoculars easily reveal it as a small blue-green disk.",
    Neptune: "Neptune reaches opposition, its closest approach to Earth this year. At magnitude ~7.8 it requires binoculars at minimum — a small telescope will show its distinctive blue-grey disk. It is the most distant planet in our solar system.",
  };
  return (
    descriptions[body] ??
    `${body} reaches opposition — its closest and brightest point of the year. Visible all night, rising at sunset.`
  );
}

function describeElongation(body: string, eastern: boolean, elongDeg: number): string {
  const sky = eastern ? 'low in the western sky shortly after sunset' : 'low in the eastern sky just before sunrise';
  const look = eastern ? 'Look west after sunset' : 'Look east before sunrise';
  const degStr = elongDeg.toFixed(1);
  if (body === 'Mercury') {
    return `Mercury reaches its greatest angular separation from the Sun (${degStr}°), making this the best window to spot the innermost planet. Look for it ${sky}. ${look} — Mercury sets or rises with the twilight and is only visible for a short window. It never strays far from the Sun in our sky.`;
  }
  return `Venus reaches its greatest angular separation from the Sun (${degStr}°) — the best viewing opportunity of this apparition. Find it ${sky}, shining brilliantly at magnitude −4 or brighter, far outshining every other star and planet. ${look} and it will be unmistakable.`;
}
