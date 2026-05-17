import { usno } from '../clients/usno.ts';
import { fetchLunarEclipses, eclipseVisibility } from '../clients/nasa.ts';
import type { CalendarEvent, ContactTime, Generator } from '../../shared/models.ts';

function makeDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

function parseSolarType(event: string): string {
  const e = event.toLowerCase();
  if (e.includes('total')) return 'Total';
  if (e.includes('annular')) return 'Annular';
  if (e.includes('hybrid')) return 'Hybrid';
  return 'Partial';
}

export const solarEclipsesGenerator: Generator = {
  slug: 'eclipses-solar',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.solarEclipses(year);
    return data.eclipses_in_year.map((eclipse) => {
      const dateStr = makeDateStr(eclipse.year, eclipse.month, eclipse.day);
      const type = parseSolarType(eclipse.event);
      return {
        uid: `eclipse-solar-${dateStr}@space-calendar`,
        title: `${type} Solar Eclipse`,
        start: dateStr,
        end: nextDayStr(dateStr),
        allDay: true,
        description: describeSolarEclipse(type),
        url: 'https://science.nasa.gov/eclipses/',
        category: 'eclipses-solar',
      };
    });
  },
};

export const lunarEclipsesGenerator: Generator = {
  slug: 'eclipses-lunar',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const eclipses = await fetchLunarEclipses(year);
    return eclipses.map((eclipse) => {
      const suffix = eclipse.type === 'Total' ? ' — Blood Moon' : '';
      const visible = eclipseVisibility(eclipse.geoLng);
      const datePrefix = `${eclipse.year}-${String(eclipse.month).padStart(2, '0')}-${String(eclipse.day).padStart(2, '0')}`;
      const greatestISO = `${datePrefix}T${eclipse.greatest}:00Z`;
      const contactTimes: ContactTime[] = [{ label: 'P1 — penumbral begins', utc: eclipse.p1 }];
      if (eclipse.u1) contactTimes.push({ label: 'U1 — partial begins', utc: eclipse.u1 });
      if (eclipse.u2) contactTimes.push({ label: 'U2 — totality begins', utc: eclipse.u2 });
      contactTimes.push({ label: 'Greatest eclipse', utc: greatestISO });
      if (eclipse.u3) contactTimes.push({ label: 'U3 — totality ends', utc: eclipse.u3 });
      if (eclipse.u4) contactTimes.push({ label: 'U4 — partial ends', utc: eclipse.u4 });
      contactTimes.push({ label: 'P4 — penumbral ends', utc: eclipse.p4 });

      return {
        uid: `eclipse-lunar-${datePrefix}@space-calendar`,
        title: `${eclipse.type} Lunar Eclipse${suffix}`,
        start: eclipse.p1,
        end: eclipse.p4,
        allDay: false,
        description: describeLunarEclipse(eclipse.type, visible),
        contactTimes,
        url: 'https://science.nasa.gov/eclipses/',
        category: 'eclipses-lunar',
      };
    });
  },
};

function describeSolarEclipse(type: string): string {
  switch (type) {
    case 'Total':
      return [
        `A total solar eclipse is one of nature's most dramatic events. The Moon completely blocks the Sun, turning day briefly to twilight and revealing the Sun's corona — its outer atmosphere — to the naked eye.`,
        `Outside the path of totality, observers will see a partial eclipse. Never look directly at the Sun except during the brief moments of full totality. Check NASA's eclipse page for the visibility path and full phase timetable.`,
      ].join('\n\n');
    case 'Annular':
      return [
        `An annular solar eclipse occurs when the Moon is slightly farther from Earth than usual, making it appear too small to fully cover the Sun. The result is a brilliant "ring of fire" — a thin ring of sunlight surrounding the Moon's silhouette.`,
        `Eclipse glasses are required throughout — the Sun is never fully blocked. Check NASA's eclipse page for the visibility path and phase timetable.`,
      ].join('\n\n');
    case 'Hybrid':
      return [
        `A hybrid solar eclipse is rare — it shifts between total and annular along its path, appearing total from some locations and annular from others depending on Earth's curvature.`,
        `Eclipse glasses are required except during full totality for those in the total path. Check NASA's eclipse page for details.`,
      ].join('\n\n');
    default:
      return `A partial solar eclipse is visible from parts of Earth today. The Moon covers only a portion of the Sun's disk. Eclipse glasses are required for safe viewing throughout the event.`;
  }
}

function describeLunarEclipse(type: string, visible: string): string {
  switch (type) {
    case 'Total':
      return [
        `During a total lunar eclipse, Earth passes directly between the Sun and Moon, casting its full shadow (umbra) across the lunar surface. The Moon turns a deep red or orange — a "Blood Moon" — caused by sunlight bending through Earth's atmosphere and scattering onto the Moon's surface.`,
        `Visible from: ${visible}. Safe to observe with the naked eye from anywhere on the night side of Earth.`,
      ].join('\n\n');
    case 'Partial':
      return [
        `During a partial lunar eclipse, Earth's umbra covers only part of the Moon, creating a striking shadow across part of the lunar disk.`,
        `Visible from: ${visible}. Safe to observe with the naked eye — no equipment needed.`,
      ].join('\n\n');
    default:
      return [
        `A penumbral lunar eclipse is subtle — the Moon passes through Earth's outer shadow (penumbra), causing a slight dimming that requires careful observation to notice.`,
        `Visible from: ${visible}.`,
      ].join('\n\n');
  }
}
