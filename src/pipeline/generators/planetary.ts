import { fetchPlanetaryEvents } from '../clients/jpl.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

export const oppositionsGenerator: Generator = {
  slug: 'oppositions',
  schedule: 'monthly',

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
  schedule: 'monthly',

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

export function describeOpposition(body: string): string {
  const descriptions: Record<string, string> = {
    Mars: `Mars rises at sunset and is visible all night — the Red Planet at its closest to Earth in this two-year cycle. Look for its unmistakable reddish-orange color, distinctly warmer than any star nearby. Through a small telescope on steady nights: dark basaltic plains, one or both polar ice caps, and the largest surface features.\n\nMars oppositions vary dramatically. Perihelic oppositions (when Mars is also near perihelion) bring it within 56 million km with a disk up to 25 arcseconds across. Aphelic oppositions keep it near 100 million km with a disk under 14 arcseconds. Check the angular diameter for this year to calibrate expectations — but any opposition is the best Mars will look for the next two years.`,
    Jupiter: `Jupiter rises at sunset and dominates the night sky — the brightest point of light after the Moon on most nights. Binoculars reveal all four Galilean moons (Io, Europa, Ganymede, Callisto) as a chain of tiny points on either side of the disk; watch them shift position night to night. A small telescope at 60× or more shows the dark equatorial cloud bands and, with patience, the Great Red Spot rotating across the face every ten hours.\n\nOpposition is Jupiter's best night of the year, though it remains excellent for weeks before and after — its disk doesn't change dramatically in apparent size over that window.`,
    Saturn: `Saturn rises at sunset and is visible all night — the ringed planet at its closest and brightest. Even a 30× telescope clearly shows the rings, separated from the disk by the dark Cassini Division. The moon Titan is visible as a faint golden point nearby.\n\nSaturn's ring tilt changes over its 29-year orbit, ranging from nearly edge-on (rings barely a line) to tilted at 27° (rings at their most spectacular). In 2025 the rings passed through edge-on and are now opening again — check the current ring tilt to know what the eyepiece view will show.`,
    Uranus: `Uranus reaches its closest point to Earth this year at around magnitude 5.7 — right at the limit of naked-eye detection from a truly dark site, but an easy binocular target. It appears as a steady blue-green point distinct from background stars (which twinkle; Uranus does not). A telescope at 100× or more reveals a small, pale aqua disk about 3.7 arcseconds across.\n\nUranus was the first planet discovered with a telescope — William Herschel spotted it in 1781, initially mistaking it for a comet. Opposition is the best time of year to find it.`,
    Neptune: `Neptune reaches opposition — its closest approach to Earth this year, still nearly 4.4 billion km away. At magnitude ~7.8 it's invisible to the naked eye; binoculars show it as an extremely faint blue-grey point. A telescope at 150× or more reveals a tiny disk about 2.3 arcseconds across.\n\nNeptune moves so slowly (one full orbit in 165 years) that a star chart is essential to distinguish it from background stars. It was discovered in 1846 through pure mathematical prediction, the first planet found by calculation rather than observation.`,
  };
  return (
    descriptions[body] ??
    `${body} reaches opposition — its closest and brightest point of the year. Visible all night, rising at sunset.`
  );
}

export function describeElongation(body: string, eastern: boolean, elongDeg: number): string {
  const degStr = elongDeg.toFixed(1);
  if (body === 'Mercury') {
    const sky = eastern ? 'western sky' : 'eastern sky';
    const when = eastern ? 'after sunset' : 'before sunrise';
    const look = eastern ? 'Look west after sunset' : 'Look east before sunrise';
    let quality: string;
    if (elongDeg >= 25) {
      quality = `At ${degStr}°, this is a favorable elongation — Mercury stands well clear of the twilight glow and is easier to spot than usual. A binocular target even for casual observers.`;
    } else if (elongDeg >= 20) {
      quality = `At ${degStr}°, this is a moderate elongation with a short but workable viewing window low in the twilight. Binoculars help.`;
    } else {
      quality = `At ${degStr}°, this is a shallow elongation — Mercury sits deep in the twilight glow and will be a challenge to spot. Binoculars are recommended; look precisely where the Sun set (or will rise).`;
    }
    return `Mercury reaches its greatest angular separation from the Sun (${degStr}°) — the best window to spot the innermost planet this apparition. ${look}: Mercury appears as a bright, steady point low in the ${sky} ${when}.\n\n${quality} Mercury never rises far from the Sun; it always stays close to the horizon near sunrise or sunset and is only visible for a brief window each apparition.`;
  }
  // Venus
  const sky = eastern ? 'western sky after sunset' : 'eastern sky before sunrise';
  const name = eastern ? 'Evening Star' : 'Morning Star';
  return `Venus reaches its greatest angular separation from the Sun (${degStr}°) — its best position as the ${name} this apparition. Look for it blazing in the ${sky}, far outshining every star and planet. At ${degStr}° from the Sun, Venus enjoys a long viewing window of well over an hour in a dark sky before it follows the Sun below the horizon.\n\nAt this elongation Venus shows a roughly half-lit phase through a telescope — like a tiny half-moon, with a disk noticeably larger than any planet appears to the naked eye.`;
}
